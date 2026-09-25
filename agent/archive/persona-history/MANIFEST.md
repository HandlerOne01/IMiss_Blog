# 人设历史归档 · MANIFEST（imiss_-blog）

- 归档时间：2026-09-26 01:17:26 +08:00
- 归档原因：发起人要求「人设文本太多了，删除之前的文本只保留爱弥斯的」——经确认含义为**文件层面的归档清理**：活动目录只留最新一版爱弥斯人设源文件，历代草稿/备份/diff/逐字测试记录一律**移动进本目录，不删除**。
- 仓库：`imiss_-blog`（origin: https://gitee.com/a2186988646/imiss_-blog.git）
- 归档前 HEAD：`f4e15a5 docs(agent): 爱弥斯人设 v5（加低频称呼「同桌」）+ v4→v5 diff + v5 说明与验证记录`
- 归档方式：全部文件原本即为 git 跟踪状态，一律用 `git mv` 移动；**保留原文件名、内容逐字节不变**（无重名冲突，未使用 `-dup2` 后缀）。
- 本目录文件数：**14**；合计 **531,609 字节**。

## 一、活动目录保留（本次未改动）

| 文件 | 字节 | sha256 | 说明 |
|---|---|---|---|
| `agent/persona-aemeath-v5.txt` | 113,097 | `6CA1D1AD9686EE9024A307E5F42CE4E1714481F46A5F23B7E41670B595AD93A9` | 最新一版人设源文件（与线上 `src/agent/common/persona.txt` 逐字节相同） |
| `agent/persona-notes.md` | 15,530 | `CAD1D3699DBFBBF46CCC1D434BF01416555BC370B7E84BE75E48A69C904BB3D3` | 写作说明（按发起人要求保留；注：其正文描述的是 v1 交付物，属历史说明） |

> 名为 `persona-aemeath.txt`（无版本号）的文件**已一并归入本目录**，避免出现「两个都像最新」的歧义。活动目录里最新版只叫 `persona-aemeath-v5.txt`。

## 二、归档清单

| 文件名（归档后） | 原路径 | 归档路径 | 字节 | sha256 |
|---|---|---|---|---|
| persona-aemeath.txt | `agent/persona-aemeath.txt` | `agent/archive/persona-history/persona-aemeath.txt` | 84,853 | `186BEA6F8FB334F7349A01CF9F09872E68ED2361691E36CBD78BD987FBAA921F` |
| persona-aemeath-v1-vs-v2.diff | `agent/persona-aemeath-v1-vs-v2.diff` | `agent/archive/persona-history/persona-aemeath-v1-vs-v2.diff` | 17,798 | `4ED5EF76EA77CDC1C17A65893A8E650C5C15FE0DFC26E713341F8ED433A743C1` |
| persona-aemeath-v2.txt | `agent/persona-aemeath-v2.txt` | `agent/archive/persona-history/persona-aemeath-v2.txt` | 90,736 | `CA727CB18263ED2F40EEE233450B6C4BD4A22075ACD8CA6EB0CAF34A1E868A05` |
| persona-aemeath-v3.txt | `agent/persona-aemeath-v3.txt` | `agent/archive/persona-history/persona-aemeath-v3.txt` | 96,117 | `43389BD7C9B99D1C68533D9392FB02155B9634C890141F4289A27558B9567E81` |
| persona-aemeath-v4.txt | `agent/persona-aemeath-v4.txt` | `agent/archive/persona-history/persona-aemeath-v4.txt` | 110,410 | `EBACC7C835935ABEF6E870608F38C32E72B6CCED06071BBC1C1771E6381F3EBE` |
| persona-test-run-20260925.md | `agent/persona-test-run-20260925.md` | `agent/archive/persona-history/persona-test-run-20260925.md` | 10,137 | `1E13D044D8030194C323AC2DCA078C2CA34196BC6372370496C1AAD7222A183A` |
| persona-v1-vs-v2-raw-20260925.md | `agent/persona-v1-vs-v2-raw-20260925.md` | `agent/archive/persona-history/persona-v1-vs-v2-raw-20260925.md` | 11,448 | `51B2B92713CF1F7F907563613083780B67BE3D3B8A0B6126950EBB1572538595` |
| persona-v2-rewrite-20260925.md | `agent/persona-v2-rewrite-20260925.md` | `agent/archive/persona-history/persona-v2-rewrite-20260925.md` | 21,187 | `061D61BFD3A453E627F995039AF309F8F0C2B754C3F1BDED24F4CA6E95C57BF5` |
| persona-v2-vs-v3.diff | `agent/persona-v2-vs-v3.diff` | `agent/archive/persona-history/persona-v2-vs-v3.diff` | 27,824 | `C5C8353CA2ACB7EE4B927712918F4AE0786812262693AB8712ABCBA4E5EC2CBB` |
| persona-v3-notes-20260925.md | `agent/persona-v3-notes-20260925.md` | `agent/archive/persona-history/persona-v3-notes-20260925.md` | 11,712 | `339787EA67234741F732DCD9C082C2C4F7AEBF8967967CA7385DB363953C874F` |
| persona-v3-vs-v4.diff | `agent/persona-v3-vs-v4.diff` | `agent/archive/persona-history/persona-v3-vs-v4.diff` | 24,001 | `7A5BBE8321410A3F8DFEF315701F4FFD6FB4D523DFDF43B841CB982FB92FFE78` |
| persona-v4-notes-20260925.md | `agent/persona-v4-notes-20260925.md` | `agent/archive/persona-history/persona-v4-notes-20260925.md` | 8,186 | `0D161D04F9752ED4BD677286C852ECFDA53211EA123767DF2BA914930D4BCEE0` |
| persona-v4-vs-v5.diff | `agent/persona-v4-vs-v5.diff` | `agent/archive/persona-history/persona-v4-vs-v5.diff` | 6,420 | `1D02E7E96FC21302D8F2617169E90974829A51E1F8B4AC00347F460017249FEC` |
| persona-v5-notes-20260925.md | `agent/persona-v5-notes-20260925.md` | `agent/archive/persona-history/persona-v5-notes-20260925.md` | 10,780 | `51AB987E0563452512B58E333C9D824BEBC84BED45C19203BFB389C14C0CD388` |

## 三、复核结果

- 归档后逐个重算 sha256：与移动前记录 **14/14 完全一致**（0 处不一致）。
- gent/persona-aemeath-v5.txt 未被移动，sha256 = `6CA1D1AD9686EE9024A307E5F42CE4E1714481F46A5F23B7E41670B595AD93A9`。

## 四、如何回溯

```powershell
# 取回某一版（示例：v4 源文件）
git mv agent/archive/persona-history/persona-aemeath-v4.txt agent/persona-aemeath-v4.txt
# 或直接看内容 / 与最新版 diff
Get-Content agent/archive/persona-history/persona-aemeath-v4.txt -TotalCount 20
git diff --no-index agent/archive/persona-history/persona-aemeath-v4.txt agent/persona-aemeath-v5.txt
```

> 提醒：人设文本是进程启动时读入内存的（`src/agent/common/persona.py` 模块级加载），**改动人设需重启进程才生效**。

