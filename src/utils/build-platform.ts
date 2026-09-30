type DetectBuildPlatformOptions = {
	env: Record<string, string | undefined>;
	isCI: boolean;
	ciName?: string | null;
	isDev?: boolean;
	unknownBuildPlatform?: string;
};
// 构建平台覆盖：用“IMISS_BUILD_PLATFORM”环境变量自定义构建平台名（本站当前名）。
const BUILD_PLATFORM_OVERRIDE_KEY = "IMISS_BUILD_PLATFORM";
// ⚠️ 向后兼容（P4-8，v1.50）：本变量在改名前的名字是 "FIREFLY_BUILD_PLATFORM"。
//    部署平台（Vercel / Cloudflare Workers 控制台）里的环境变量是在**本仓库之外**
//    设置的 —— 仓库里改个常量名，线上那份配置不会跟着改。若只认新名，凡是线上仍用
//    旧名的部署都会**静默退回自动识别**（本函数后面的 ciName / EDGEONE_PROJECT_ID /
//    ESA 分支），页面上的"构建平台"一栏会悄悄从自定义值变成 "Vercel"/"Unknown CI"，
//    没有任何报错。所以这里保留旧名并排在**新名之后**：新名优先，旧名兜底。
//    将来要摘掉旧名，前提是先确认所有部署环境都已改用 "IMISS_BUILD_PLATFORM"。
const LEGACY_BUILD_PLATFORM_OVERRIDE_KEY = "FIREFLY_BUILD_PLATFORM";

function hasNonEmptyEnv(
	env: Record<string, string | undefined>,
	key: string,
): boolean {
	const value = env[key];
	return typeof value === "string" && value.trim() !== "";
}

/**
 * 取覆盖值：**新名优先，旧名兜底**（两个都空则返回 undefined，继续走自动识别）。
 * 用 `hasNonEmptyEnv` 而不是直接取 env[key]，是为了让"设了但为空串/纯空白"也走兜底 ——
 * 线上常见「变量存在但值为空」，那种情况下应该继续尝试旧名，而不是当成"用户显式要求空平台名"。
 */
function resolveBuildPlatformOverride(
	env: Record<string, string | undefined>,
): string | undefined {
	for (const key of [
		BUILD_PLATFORM_OVERRIDE_KEY,
		LEGACY_BUILD_PLATFORM_OVERRIDE_KEY,
	]) {
		if (hasNonEmptyEnv(env, key)) {
			return env[key];
		}
	}
	return undefined;
}

function envUrlHostEquals(
	env: Record<string, string | undefined>,
	key: string,
	expectedHost: string,
): boolean {
	const value = env[key];
	if (typeof value !== "string" || value.trim() === "") {
		return false;
	}

	try {
		// ESA 当前构建环境里没有平台专属键名，用稳定的内部er_address键值 host 做识别
		return new URL(value).host.toLowerCase() === expectedHost.toLowerCase();
	} catch {
		return false;
	}
}

export function detectBuildPlatform({
	env,
	isCI,
	ciName,
	isDev = false,
	unknownBuildPlatform = "Unknown CI",
}: DetectBuildPlatformOptions): string {
	const overrideValue = resolveBuildPlatformOverride(env);
	if (typeof overrideValue === "string" && overrideValue.trim() !== "") {
		// 环境变量显式覆盖最优先，可以用“IMISS_BUILD_PLATFORM”环境变量自定义不同部署平台的名字
		// （默认值为空，无定义，继续后续自动识别；旧名 "FIREFLY_BUILD_PLATFORM" 仍然兼容，见文件顶部注释）
		return overrideValue.trim();
	}
	// ciName 自动识别
	if (ciName?.trim()) {
		return ciName.trim();
	}
	//补充EdgeOne Pages 和 ESA Pages 识别逻辑
	if (hasNonEmptyEnv(env, "EDGEONE_PROJECT_ID")) {
		return "EdgeOne Pages";
	}

	if (envUrlHostEquals(env, "er_address", "build-script.esa.ialicdn.com")) {
		return "ESA Pages";
	}

	if (isCI) {
		return unknownBuildPlatform;
	}

	return isDev ? "Local Dev" : "Local";
}
