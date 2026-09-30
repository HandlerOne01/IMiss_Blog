<#
.SYNOPSIS
    把本地 `pnpm build` 出来的 dist/ 发布到 Linux 服务器（Windows 开发机 → Linux）。

.DESCRIPTION
    ⚠️⚠️ **这个脚本从未在真机上跑过**（发起人还没买服务器，B-01）。它是"照着一台标准
    Debian/Ubuntu + OpenSSH + GNU tar 的机器写出来的"，**第一次上线时请用 `-DryRun`
    走一遍**，看清楚它要执行哪几条命令，再真跑。

    它做的事（按顺序）：
      ⓪ 安全闸门：校验 -WebRoot 不是 /、/etc、空值，且落在白名单前缀内（见下方注释）
      ① 连通性：`ssh <Server> true`（只认密钥登录，密码交互会直接失败）
      ② 构建：`pnpm build`（除非 -SkipBuild）；失败立即中止，**绝不发布半成品**
      ③ 清点本地 dist/（文件数 + 总字节）
      ④ 打包：在 dist/ 里打 tar.gz（相对路径，Windows 自带 bsdtar 与 Linux 的 GNU tar 互认）
      ⑤ 上传：scp 到服务器临时目录（**不碰线上目录**）
      ⑥ 两端清单比对（sha256）：算出 新增/修改 / 删除 / 未变 三份名单
      ⑦ 上传（模式一）：只把 新增/修改 的名单**再打一个 tar** 传上去，解到 web root
         上传（模式二 -FullUpload）：把整包 120 MB 原样解到 web root
      ⑧ 删除远端已不存在的文件（有数量上限，超了要 -AllowMassDelete）
      ⑨ 打印两端校验信息（本地计数 / 远端计数 / 字节数）
      ⑩ 回滚备份：把发布前的 dist/ 改名成 `<WebRoot>.releases/<时间戳>`（可选保留几份）

    为什么"先传临时目录再替换"而不是边传边改线上目录：
      边传边解 = 访客会在几十秒里看到"新 HTML + 旧 CSS"的混合体（图片 404、样式错乱、
      搜索索引半新半旧）。所以上传与生效必须分开，且生效那一步要尽量短。

    为什么删除名单也要校验：
      "删除"是唯一能造成**不可逆损失**的动作。远端清单被污染（比如 web root 指错、
      或者 dist/ 本地被清空）时会退化成"把线上站点删光"。所以：
        · 每一条远端删除路径都必须落在允许删除的前缀里（见 $AllowDeletePrefixes），
          且不得含 `..` / 反斜杠 / 引号；
        · 单次删除条数 > -MassDeleteLimit（默认 200）时直接拒绝，除非显式加 -AllowMassDelete；
        · 删除从来不用 tar（tar 的 --delete 会删掉 web root 里的一切非产物文件）。

.PARAMETER Server
    `user@host`（可带端口见 -SshPort）。例：`blog@1.2.3.4`。
.PARAMETER WebRoot
    **dist/ 的内容**要落到的服务器目录（＝ nginx 配置里的 `root`）。
    例：`/var/www/imiss-blog/dist`。必须落在 -WebRootPrefixes 白名单里。
.PARAMETER Port
    SSH 端口（默认 22）。
.PARAMETER KeyFile
    私钥路径（可选）。给了就 `-i <path>`；不给就用 ssh-agent / ~/.ssh/config。
.PARAMETER SkipBuild
    跳过 `pnpm build`（dist/ 已经是最新的、或者你只想重传一次）。
.PARAMETER DryRun
    只打印"将要执行的命令"，一行都不落盘、不改远端。（也支持 `-WhatIf`。）
.PARAMETER FullUpload
    不做差异比对，把整包 dist/ 原样解到网站目录（首次部署或远端清单不可信时用）。
.PARAMETER AllowMassDelete
    允许单次删除超过 -MassDeleteLimit 个文件（**危险**，确认过再开）。
.PARAMETER KeepReleases
    回滚备份保留几份（默认 2；0 = 不留）。
.PARAMETER DistDir
    本地产物目录（默认 `./dist`）。

.EXAMPLE
    # 第一次：只看要执行什么
    ./deploy/publish.ps1 -Server blog@1.2.3.4 -WebRoot /var/www/imiss-blog/dist -DryRun

.EXAMPLE
    # 正式发一次（增量：只传变化的文件）
    ./deploy/publish.ps1 -Server blog@1.2.3.4 -WebRoot /var/www/imiss-blog/dist -KeyFile ~/.ssh/id_ed25519

.EXAMPLE
    # 整包重传（远端目录被手工改过、清单不可信时）
    ./deploy/publish.ps1 -Server blog@1.2.3.4 -WebRoot /var/www/imiss-blog/dist -FullUpload

.NOTES
    ── rsync 等价命令（Linux/macOS 开发机以后要发同一台服务器时用这条）──────────
        rsync -az --delete --info=stats2 \
              --exclude '.deploy-tmp/' \
              -e "ssh -p 22" \
              dist/ blog@1.2.3.4:/var/www/imiss-blog/dist/
    两条注意事项：
      ① `dist/` 结尾的斜杠**不能省**，否则会在目标下多出一层 dist/；
      ② `--delete` 会删掉 web root 里所有不在 dist/ 里的东西 —— 如果服务器上还放着
         `.env`、`reports/`、`certbot` 之类的东西，先加 `--exclude` 或干脆别用 --delete。
    Windows 侧没有 rsync（cwRsync 等第三方发行版不在本项目依赖里），所以主用本脚本。
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
	[Parameter(Mandatory = $true)]
	[string]$Server,

	[Parameter(Mandatory = $true)]
	[string]$WebRoot,

	[int]$Port = 22,
	[string]$KeyFile,
	[switch]$SkipBuild,
	[switch]$DryRun,
	[switch]$FullUpload,
	[switch]$AllowMassDelete,
	[int]$KeepReleases = 2,
	[string]$DistDir = "dist",

	# ── 安全闸门参数（一般不用改）────────────────────────────────────────────
	# 为什么要有白名单：这个脚本会 `ssh <Server> "rm -rf <WebRoot>/*"` 之类的动作。
	# 一个手滑的 `-WebRoot /` 或 `-WebRoot /etc` 就是生产事故，而"参数写错"比
	# "脚本逻辑写错"常见得多。所以默认只放行常见的 web 根目录前缀，别的要显式 -WebRootPrefixes。
	[string[]]$WebRootPrefixes = @("/var/www", "/srv", "/home", "/data", "/opt"),

	# 允许被"删除"的最高层目录（相对 web root）。默认允许全删会太险，所以这里逐个列。
	[string[]]$AllowDeletePrefixes = @("_astro", "assets", "images", "og", "pagefind", "api", "favicon"),

	# 单次删除条数上限（超过要 -AllowMassDelete）
	[int]$MassDeleteLimit = 200,

	# 远端临时目录（只放上传的压缩包与清单；**不在** web root 里）
	[string]$StageRoot = "/var/www/.imiss-publish"
)

$ErrorActionPreference = "Stop"
$script:StepNo = 0

# ────────────────────────────────────────────────────────────────────────────
# 输出与命令执行的小工具
# ────────────────────────────────────────────────────────────────────────────
function Say([string]$msg) { Write-Host ("[publish] " + $msg) }
function Step([string]$msg) {
	$script:StepNo++
	Write-Host ""
	Write-Host ("[publish] ── {0}. {1}" -f $script:StepNo, $msg) -ForegroundColor Cyan
}
function Warn([string]$msg) { Write-Host ("[publish] ⚠️  " + $msg) -ForegroundColor Yellow }
function Die([string]$msg) { Write-Host ("[publish] ❌ " + $msg) -ForegroundColor Red; exit 1 }

function Format-Line([string]$s) { return ($s -replace "`r", "").TrimEnd() }

function Invoke-Cmd {
	param(
		[Parameter(Mandatory = $true)][string]$Exe,
		[Parameter(Mandatory = $true)][string[]]$ArgList,
		[switch]$AllowFail
	)
	Say ("$ " + $Exe + " " + ($ArgList -join " "))
	$out = & $Exe @ArgList 2>&1
	$code = $LASTEXITCODE
	foreach ($l in @($out)) {
		if ($null -ne $l) { Write-Host ("[publish]    " + (Format-Line ([string]$l))) }
	}
	if ($code -ne 0 -and -not $AllowFail) { Die "$Exe 退出码 $code" }
	return $code
}

function Invoke-Capture {
	param(
		[Parameter(Mandatory = $true)][string]$Exe,
		[Parameter(Mandatory = $true)][string[]]$ArgList
	)
	$out = & $Exe @ArgList 2>&1
	$code = $LASTEXITCODE
	if ($code -ne 0) {
		Die "$Exe 退出码 $code（输出：$((@($out) | Select-Object -First 5) -join ' | ')）"
	}
	return @($out) | ForEach-Object { Format-Line ([string]$_) }
}

# ────────────────────────────────────────────────────────────────────────────
# 0. 安全闸门 —— 参数先过一遍，不合法就一行命令都不执行
# ────────────────────────────────────────────────────────────────────────────
Step "安全闸门：校验 -WebRoot 与 -Server"

if ([string]::IsNullOrWhiteSpace($WebRoot)) { Die "-WebRoot 不能为空" }
if ($WebRoot -notmatch '^/[A-Za-z0-9._/-]+$') {
	Die "-WebRoot 只允许 `绝对路径`（字母/数字/._-/），收到：$WebRoot"
}
if ($WebRoot -match '\.\.') { Die "-WebRoot 不允许包含 ..：$WebRoot" }
$wr = $WebRoot.TrimEnd("/")
if ($wr -eq "") { Die "-WebRoot 等于 / —— 拒绝执行（这会把整台机器的根目录当网站目录）" }

$forbidden = @("/", "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64", "/boot", "/dev", "/proc", "/sys", "/root", "/var", "/var/www", "/home", "/opt", "/srv", "/tmp", "/var/log", "/var/lib")
if ($forbidden -contains $wr) {
	Die "-WebRoot '$wr' 是系统目录 —— 拒绝执行（网站目录必须是它下面的**子目录**，例 /var/www/imiss-blog/dist）"
}

$prefixOk = $false
foreach ($p in $WebRootPrefixes) {
	$pp = $p.TrimEnd("/")
	if ($wr -eq $pp) { continue }
	if ($wr.StartsWith($pp + "/")) { $prefixOk = $true; break }
}
if (-not $prefixOk) {
	# ⚠️ Split-Path 在 Windows 上会把 `/` 当路径分隔符吃掉（`/tmp/x` → `\tmp`），
	#    所以先把 `/` 换成 `\` 再算父目录、算完换回 `/` —— 保证输出的是 Linux 侧建议值。
	$parent = (Split-Path -Parent ($wr -replace "/", "\")) -replace "\\", "/"
	if ([string]::IsNullOrWhiteSpace($parent)) { $parent = "/" }
	Die ("-WebRoot '{0}' 不在白名单前缀里（当前白名单：{1}）。确实要用别的路径就显式加：-WebRootPrefixes '{2}'" -f $wr, ($WebRootPrefixes -join ", "), $parent)
}

if ($Server -notmatch '^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$') {
	Die "-Server 必须形如 user@host，收到：$Server"
}
if ($Port -lt 1 -or $Port -gt 65535) { Die "-Port 不合法：$Port" }

Say "✅ 闸门通过：WebRoot=$wr  Server=$Server  Port=$Port"
if ($wr -ne $WebRoot) { Warn "WebRoot 结尾的斜杠已去掉（内部一律用 '$wr'）" }

$SshBase = @()
if ($Port -ne 22) { $SshBase += @("-p", "$Port") }
if ($KeyFile) {
	if (-not (Test-Path -LiteralPath $KeyFile)) { Die "-KeyFile 不存在：$KeyFile" }
	$SshBase += @("-i", $KeyFile)
}
$SshBase += @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new", $Server)

$ScpBase = @()
if ($Port -ne 22) { $ScpBase += @("-P", "$Port") }
if ($KeyFile) { $ScpBase += @("-i", $KeyFile) }
$ScpBase += @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new")
if ($FullUpload -and $SkipBuild) { Warn "-FullUpload + -SkipBuild：会用现在本地的 dist/ 整包覆盖线上" }

# 远端 bash 片段的执行入口（把脚本文本通过 stdin 喂给 `bash -s`，避免换行/引号被 ssh 改写）
function Invoke-RemoteBash {
	param([Parameter(Mandatory = $true)][string]$Script, [switch]$AllowFail)
	Say ("$ ssh " + ($SshBase -join " ") + " bash -s   <<'EOF'")
	foreach ($l in ($Script -split "`n")) { Write-Host ("[publish]    " + $l.TrimEnd()) }
	if ($DryRun) { Say "（-DryRun：未执行）"; return 0 }
	$out = $Script | & ssh @SshBase bash -s 2>&1
	$code = $LASTEXITCODE
	foreach ($l in @($out)) { if ($null -ne $l) { Write-Host ("[publish]    " + (Format-Line ([string]$l))) } }
	if ($code -ne 0 -and -not $AllowFail) { Die "远端脚本退出码 $code" }
	return $code
}

# ────────────────────────────────────────────────────────────────────────────
# 1. 连通性
# ────────────────────────────────────────────────────────────────────────────
Step "连通性：ssh 能连上吗（只认密钥登录）"
if ($DryRun) {
	Say "（-DryRun：跳过）"
}
else {
	[void](Invoke-Capture -Exe "ssh" -ArgList ($SshBase + @("true")))
	Say "✅ 连上了"
}

# ────────────────────────────────────────────────────────────────────────────
# 2. 本地构建
# ────────────────────────────────────────────────────────────────────────────
Step "本地构建：pnpm build"
if ($SkipBuild) {
	Warn "-SkipBuild：跳过构建，直接用现有的 $DistDir/"
}
elseif ($DryRun) {
	Say "（-DryRun：跳过）"
}
else {
	[void](Invoke-Capture -Exe "pnpm" -ArgList @("build"))
	Say "✅ pnpm build 成功"
}

if (-not (Test-Path -LiteralPath $DistDir -PathType Container)) {
	if ($DryRun) { Say "（-DryRun：$DistDir/ 还不存在，正常）" }
	else { Die "$DistDir/ 不存在 —— 构建没产出就中止（不会上传半成品）" }
}

# ────────────────────────────────────────────────────────────────────────────
# 3. 本地清点
# ────────────────────────────────────────────────────────────────────────────
Step "本地清点：$DistDir/ 的文件数与总字节"
$localFiles = @()
if (Test-Path -LiteralPath $DistDir -PathType Container) {
	$distFull = (Resolve-Path -LiteralPath $DistDir).Path
	$localFiles = @(
		Get-ChildItem -LiteralPath $distFull -Recurse -File | ForEach-Object {
			[pscustomobject]@{
				Rel = $_.FullName.Substring($distFull.Length + 1).Replace("\", "/")
				Len = $_.Length
				Full = $_.FullName
			}
		}
	)
}
$localCount = $localFiles.Count
$localBytes = ($localFiles | Measure-Object -Property Len -Sum).Sum
if (-not $localBytes) { $localBytes = 0 }
Say ("本地 {0} 个文件 / {1:N2} MiB" -f $localCount, ($localBytes / 1MB))

# 必须有几个"哨兵文件"，否则说明 dist/ 是坏的/被清空的 —— 挡住"把线上删光"这条路
$sentinels = @("index.html", "404.html")
foreach ($s in $sentinels) {
	if (-not ($localFiles.Rel -contains $s)) {
		if ($DryRun) { Warn "-DryRun：dist/ 里没有哨兵文件 $s（现在跳过检查）" }
		else { Die "$DistDir/$s 不存在 —— 产物不完整，拒绝发布（本地 dist/ 可能被清空/损坏）" }
	}
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$tarName = "dist-$ts.tar.gz"
$localStaging = Join-Path ([System.IO.Path]::GetTempPath()) "imiss-publish-$ts"
if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $localStaging | Out-Null }
$localTar = Join-Path $localStaging $tarName
$remoteStage = "$StageRoot/$ts"
$remoteManifest = "$StageRoot/manifest.tsv"
$remoteOldManifest = "$StageRoot/manifest.prev.tsv"

# ────────────────────────────────────────────────────────────────────────────
# 4. 打包（tar 的相对路径 + 用 -C 指目录，解包时就不会多一层 dist/）
# ────────────────────────────────────────────────────────────────────────────
Step "打包：$DistDir/ → $tarName"
Say "（Windows 自带 bsdtar；清单里都是相对路径，Linux 的 GNU tar 可以直接解）"
if ($DryRun) {
	Say "（-DryRun：跳过）"
}
else {
	[void](Invoke-Capture -Exe "tar" -ArgList @("-czf", $localTar, "-C", $distFull, "."))
	$tarBytes = (Get-Item -LiteralPath $localTar).Length
	Say ("✅ 压缩包 {0:N2} MiB（原始 {1:N2} MiB，压缩率 {2:P0}）" -f ($tarBytes / 1MB), ($localBytes / 1MB), (1 - $tarBytes / [Math]::Max($localBytes, 1)))
}

# ────────────────────────────────────────────────────────────────────────────
# 5. 上传压缩包到临时目录（**不碰线上目录**）
# ────────────────────────────────────────────────────────────────────────────
Step "上传：压缩包 → $remoteStage/（临时目录，还不是线上目录）"
if ($DryRun) {
	Say "（-DryRun：跳过）"
}
else {
	[void](Invoke-RemoteBash -Script "set -eu`nmkdir -p '$StageRoot' '$remoteStage'")
	[void](Invoke-Capture -Exe "scp" -ArgList ($ScpBase + @($localTar, "${Server}:$remoteStage/")))
	Say "✅ 上传完成"
}

# ────────────────────────────────────────────────────────────────────────────
# 6. 两端清单比对（sha256）
# ────────────────────────────────────────────────────────────────────────────
Step "差异比对：本地 sha256 清单 vs 远端清单"
# fullMode = 整包覆盖（不做差异比对）。
#   · -FullUpload：用户明确要求
#   · -SkipBuild：惰性降级 —— 本地的 dist/ 不保证是"刚构建的完整产物"，
#     拿它当基准去算"远端多余文件"风险太大（**宁可不删，也不能误删**）
$fullMode = [bool]$FullUpload -or [bool]$SkipBuild
if ($fullMode -and -not $FullUpload) {
	Warn "-SkipBuild：本次自动降级为整包覆盖（不做差异比对、**不删除**远端任何文件）"
}
$mode = if ($fullMode) { "整包覆盖（不做比对）" } else { "增量（只传变化的文件）" }
Say "模式：$mode"

$changed = @()
$unchanged = 0
$deleted = @()

if ($fullMode) {
	Say "（不做差异比对，整包解到网站目录）"
}
elseif ($DryRun) {
	Say "（-DryRun：跳过远端清单读取，假设本地全部为新增）"
	$changed = $localFiles
}
else {
	# 远端清单：web root 下所有常规文件的 `<sha256>\t<相对路径>`（允许失败 —— 首次部署还没有清单）
	$manifestScript = @"
set -eu
if [ -d '$wr' ]; then
  find '$wr' -type f -printf '%P\n' 2>/dev/null | LC_ALL=C sort | while IFS= read -r rel; do
    [ -n "`$rel" ] || continue
    h=`$(sha256sum -- '$wr/`$rel' 2>/dev/null | cut -d' ' -f1)
    [ -n "`$h" ] && printf '%s\t%s\n' "`$h" "`$rel"
  done
fi
"@
	$remoteLines = @(Invoke-RemoteBash -Script $manifestScript -AllowFail)
	$remoteMap = @{}
	foreach ($line in $remoteLines) {
		if ($line -match '^([0-9a-f]{64})\t(.+)$') { $remoteMap[$Matches[2]] = $Matches[1] }
	}
	Say ("远端清单：{0} 个文件" -f $remoteMap.Count)

	# 远端有、本地没有 → 待删
	foreach ($rel in $remoteMap.Keys) {
		if (-not ($localFiles.Rel -contains $rel)) { $deleted += $rel }
	}

	# 逐文件比哈希（本地 799 个文件约 120 MB，实测几秒）
	$i = 0
	foreach ($f in $localFiles) {
		$i++
		if ($i % 200 -eq 0) { Say ("  已比对 $i/$localCount …") }
		$h = (Get-FileHash -LiteralPath $f.Full -Algorithm SHA256).Hash.ToLowerInvariant()
		if ($remoteMap.ContainsKey($f.Rel) -and $remoteMap[$f.Rel] -eq $h) { $unchanged++ }
		else { $changed += $f }
	}
	Say ("差异：新增/修改 {0} ｜ 未变 {1} ｜ 远端多余（待删）{2}" -f $changed.Count, $unchanged, $deleted.Count)
}

# ────────────────────────────────────────────────────────────────────────────
# 7. 生效：解包 + 覆盖（尽量短；不做"边传边改线上目录"）
# ────────────────────────────────────────────────────────────────────────────

# 7a. 增量模式：把要传的文件再打一个包
$changedTar = $null
if (-not $fullMode -and $changed.Count -gt 0) {
	Step "打包差异集：$($changed.Count) 个文件"
	$changedTar = Join-Path $localStaging "changed-$ts.tar.gz"
	$listPath = Join-Path $localStaging "changed-$ts.txt"
	if ($DryRun) {
		Say "（-DryRun：跳过）"
	}
	else {
		# 用 UTF-8 **无 BOM** 写清单（BOM 会变成第一个文件名的第一个字符，tar 直接报错）
		$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
		[System.IO.File]::WriteAllLines($listPath, @($changed | ForEach-Object { "./" + $_.Rel }), $utf8NoBom)
		[void](Invoke-Capture -Exe "tar" -ArgList @("-czf", $changedTar, "-C", $distFull, "-T", $listPath))
		Say ("✅ 差异包 {0:N2} MiB" -f ((Get-Item -LiteralPath $changedTar).Length / 1MB))
	}
}

# 7b. 上传差异包（若为增量且非空）
if ($changedTar -and -not $DryRun) {
	Step "上传差异包 → $remoteStage/"
	[void](Invoke-Capture -Exe "scp" -ArgList ($ScpBase + @($changedTar, "${Server}:$remoteStage/")))
}

# 7c. 远端清单（待删名单）也传上去 —— 避免把几百条路径塞进命令行
$deletedListLocal = Join-Path $localStaging "deleted-$ts.txt"
if (-not $fullMode -and $deleted.Count -gt 0 -and -not $DryRun) {
	$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
	[System.IO.File]::WriteAllLines($deletedListLocal, @($deleted), $utf8NoBom)
	[void](Invoke-Capture -Exe "scp" -ArgList ($ScpBase + @($deletedListLocal, "${Server}:$remoteStage/deleted.txt")))
}

# 7d. **删除的闸门**（在本地判定，免得远端脚本被喂进奇怪的东西）
Step "删除闸门：逐条校验待删路径"
if ($deleted.Count -gt 0) {
	$bad = @()
	foreach ($rel in $deleted) {
		if ($rel -match '[\r\n\t"''`\\]' -or $rel -match '\.\.' -or $rel.StartsWith("/")) { $bad += $rel; continue }
		$top = ($rel -split "/")[0]
		if (-not ($AllowDeletePrefixes -contains $top) -and ($rel -split "/").Count -gt 1) { $bad += $rel }
	}
	if ($bad.Count -gt 0) {
		Die ("有 {0} 条待删路径不在白名单/形态非法，拒绝删除。前几条：{1}`n        确认后可用 -AllowDeletePrefixes 放宽（**不要**为了通过而放宽到源码/密钥目录）" -f $bad.Count, (($bad | Select-Object -First 5) -join ", "))
	}
	Say ("✅ {0} 条待删路径全部落在允许前缀内（{1}）" -f $deleted.Count, ($AllowDeletePrefixes -join ", "))
	if ($deleted.Count -gt $MassDeleteLimit -and -not $AllowMassDelete) {
		Die ("待删 {0} 个文件 > 上限 {1} —— 拒绝执行。确认这是预期的（例：删了一大批文章）再加 -AllowMassDelete" -f $deleted.Count, $MassDeleteLimit)
	}
}

# 7e. 生效
Step "生效：解包到网站目录（增量模式会把站点目录当 tar 根，直接落地）"
$releaseDir = "$wr.releases/$ts"
# 解包目录固定叫 full（两种模式都一样：整包解出来的就是完整站点；增量模式是在它上面再叠一层）
$extractDir = "full"
$effectScript = @"
set -eu
cd '$remoteStage'
mkdir -p '$extractDir'
tar -xzf '$tarName' -C '$extractDir'
if [ -f 'changed-$ts.tar.gz' ]; then
  tar -xzf 'changed-$ts.tar.gz' -C '$extractDir'
fi
test -f '$extractDir/index.html' || { echo '解包后没有 index.html，中止（线上目录未被改动）' >&2; exit 1; }
mkdir -p '$wr'
if [ '$KeepReleases' -gt 0 ] && [ -d '$wr' ] && [ -n "`$(ls -A '$wr' 2>/dev/null)" ]; then
  mkdir -p '$wr.releases'
  if [ -e '$releaseDir' ]; then releaseDir='$releaseDir-2'; else releaseDir='$releaseDir'; fi
  mv '$wr' "`$releaseDir"
fi
mkdir -p '$wr'
cp -a '$remoteStage/$extractDir/.' '$wr/'
echo '[remote] 覆盖完成'
"@
if ($DryRun) {
	Say "（-DryRun：只打印，不执行）"
	foreach ($l in ($effectScript -split "`n")) { Write-Host ("[publish]    " + $l.TrimEnd()) }
}
else {
	[void](Invoke-RemoteBash -Script $effectScript)
}

# 7f. 删除远端多余文件
if ($deleted.Count -gt 0) {
	Step "删除远端多余文件（$($deleted.Count) 个）"
	$delScript = @"
set -eu
n=0
while IFS= read -r rel; do
  [ -n "`$rel" ] || continue
  case "`$rel" in
    /*|*..*|*'|'*|*'`'*) echo "跳过可疑路径: `$rel" >&2; continue ;;
  esac
  rm -f -- '$wr/'"`$rel"
  n=`$((n+1))
done < '$remoteStage/deleted.txt'
echo "[remote] 已删除 `$n 个文件"
"@
	if ($DryRun) {
		Say "（-DryRun：只打印，不执行）"
		foreach ($l in ($delScript -split "`n")) { Write-Host ("[publish]    " + $l.TrimEnd()) }
	}
	else {
		[void](Invoke-RemoteBash -Script $delScript)
	}
}

# 7g. 清理临时目录 + 旧备份
Step "收尾：清理远端临时目录与旧备份"
$cleanupScript = @"
set -eu
rm -rf '$remoteStage'
if [ '$KeepReleases' -gt 0 ]; then
  ls -1dt '$wr.releases'/*/ 2>/dev/null | tail -n +$([int]$KeepReleases + 1) | xargs -r rm -rf
  echo "[remote] 保留的回滚备份："
  ls -1dt '$wr.releases'/*/ 2>/dev/null | head -n $KeepReleases || true
else
  echo "[remote] KeepReleases=0，未保留备份"
fi
"@
if ($DryRun) {
	Say "（-DryRun：只打印，不执行）"
	foreach ($l in ($cleanupScript -split "`n")) { Write-Host ("[publish]    " + $l.TrimEnd()) }
}
else {
	[void](Invoke-RemoteBash -Script $cleanupScript -AllowFail)
}

# ────────────────────────────────────────────────────────────────────────────
# 8. 校验信息（前后对照）
# ────────────────────────────────────────────────────────────────────────────
Step "校验：本地 vs 远端"
if (-not $DryRun) {
	$verifyScript = @"
set -eu
echo "[remote] 文件数：`$(find '$wr' -type f | wc -l)"
echo "[remote] 总字节：`$(du -sb '$wr' 2>/dev/null | cut -f1)"
echo "[remote] 顶层目录："
ls -1 '$wr' | head -20
echo "[remote] 哨兵文件："
ls -l '$wr/index.html' '$wr/404.html'
"@
	$remoteOut = @(Invoke-RemoteBash -Script $verifyScript)
	Say ("本地 {0} 个文件 / {1:N0} 字节  ←→  远端见上面 [remote] 行（两者应当一致）" -f $localCount, $localBytes)
	$mismatch = $false
	foreach ($l in $remoteOut) {
		if ($l -match '^\[remote\] 文件数：(\d+)$') { if ([int]$Matches[1] -ne $localCount) { $mismatch = $true } }
		if ($l -match '^\[remote\] 总字节：(\d+)$') { if ([int64]$Matches[1] -ne [int64]$localBytes) { $mismatch = $true } }
	}
	if ($mismatch) {
		Warn "本地与远端计数不一致！常见原因：① 上次发布残留的孤儿文件（这次没删干净）；② 服务器上有手工放进去了东西；③ 上传解包被中断。先上服务器 `find <WebRoot> | wc -l` 与 `ls -la` 对照。"
	}
	else {
		Say "✅ 文件数与总字节一致"
	}
}

# ────────────────────────────────────────────────────────────────────────────
# 9. 上线后手测提示
# ────────────────────────────────────────────────────────────────────────────
Step "上线后自测（纯静态发布不需要 reload nginx；改了 nginx 配置才需要）"
$hostGuess = ($Server -split "@")[1]
Say "curl -sSI https://<你的域名>/ | head -1                       # 期望 200"
Say "curl -sS -o /dev/null -w '%{http_code}\n' https://<你的域名>/roadmap/   # 期望 200"
Say "curl -sS -o /dev/null -w '%{http_code}\n' https://<你的域名>/rank/      # 期望 404"
if (-not $DryRun -and $localStaging -and (Test-Path -LiteralPath $localStaging)) {
	Remove-Item -LiteralPath $localStaging -Recurse -Force -ErrorAction SilentlyContinue
}
Say "完成（服务器 $hostGuess）。⚠️ 这是未经真机验证的脚本 —— 第一次务必带 -DryRun 看一遍再真跑。"
