/**
 * Android 构建加速插件：
 * 1. 在 settings.gradle / build.gradle 中使用国内 Maven 镜像，并保留本地 Maven 仓库作为兜底；
 * 2. Gradle wrapper 默认使用腾讯云镜像，避免从 services.gradle.org 慢速下载发行包。
 *
 * 注意：本地仓库可能只有 POM 而没有对应的 JAR（下载中断会留下这种半成品）。
 * Gradle 一旦在某个仓库找到 POM，就不会再去后面的仓库查找 JAR，因此国内镜像必须
 * 排在本地仓库之前；本地仓库仍会作为兜底参与解析。
 *
 * 可通过 COFFER_GRADLE_DISTRIBUTION_URL 环境变量覆盖发行包地址。
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withProjectBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const START = '// @coffer-local-repos-start';
const END = '// @coffer-local-repos-end';

const MAVEN_MIRRORS = [
  'https://maven.aliyun.com/repository/google',
  'https://maven.aliyun.com/repository/public',
  'https://maven.aliyun.com/repository/gradle-plugin',
  'https://mirrors.cloud.tencent.com/nexus/repository/maven-public/',
  'https://repo.huaweicloud.com/repository/maven/',
];

const DEFAULT_DISTRIBUTION_BASE = 'https://mirrors.cloud.tencent.com/gradle/';

function normalizeRepoPath(value) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.startsWith('file:') ? normalized : `file:///${normalized.replace(/^\/+/, '')}`;
}

function groovyMavenRepos({ includePluginPortal = false, localMavenRepo } = {}) {
  const lines = [];
  for (const mirror of MAVEN_MIRRORS) {
    lines.push(`    maven { url = uri('${mirror}') }`);
  }
  if (localMavenRepo) {
    lines.push(`    maven { url = uri('${localMavenRepo}') }`);
  }
  lines.push('    mavenLocal()');
  lines.push('    google()');
  lines.push('    mavenCentral()');
  if (includePluginPortal) {
    lines.push('    gradlePluginPortal()');
  }
  return `${START}\n${lines.join('\n')}\n${END}`;
}

function stripExistingMarkers(text) {
  return text.replace(new RegExp(`${START}[\\s\\S]*?${END}`, 'g'), '');
}

/** 在第一个 `xxx {` 的 repositories 内插入；没有 repositories 就在块首插入。 */
function injectIntoBlock(text, blockPattern, options) {
  let next = text;
  const block = blockPattern.exec(next);
  if (!block) {
    return { text: next, inserted: false };
  }
  const openIndex = block.index + block[0].length;
  const repoPattern = /repositories\s*\{/;
  const remainder = next.slice(openIndex);
  const repoMatch = repoPattern.exec(remainder);
  // 只在当前块的大致范围内查找 repositories，避免误伤后面的块。
  const blockEndApprox = remainder.search(/\n\}/);
  if (repoMatch && (blockEndApprox === -1 || repoMatch.index < blockEndApprox)) {
    const insertAt = openIndex + repoMatch.index + repoMatch[0].length;
    next = `${next.slice(0, insertAt)}\n${groovyMavenRepos(options)}\n${next.slice(insertAt)}`;
  } else {
    next = `${next.slice(0, openIndex)}\n  repositories {\n${groovyMavenRepos(options)}\n  }\n${next.slice(openIndex)}`;
  }
  return { text: next, inserted: true };
}

function configureSettings(contents, localMavenRepo) {
  let next = stripExistingMarkers(contents);

  if (/pluginManagement\s*\{/.test(next)) {
    next = injectIntoBlock(next, /pluginManagement\s*\{/, {
      includePluginPortal: true,
      localMavenRepo,
    }).text;
  } else {
    next = `pluginManagement {\n  repositories {\n${groovyMavenRepos({ includePluginPortal: true, localMavenRepo })}\n  }\n}\n\n${next}`;
  }

  if (/dependencyResolutionManagement\s*\{/.test(next)) {
    next = injectIntoBlock(next, /dependencyResolutionManagement\s*\{/, {
      localMavenRepo,
    }).text;
  } else {
    next += `\n\ndependencyResolutionManagement {\n  repositories {\n${groovyMavenRepos({ localMavenRepo })}\n  }\n}\n`;
  }
  return next;
}

function withSettingsRepos(config, localMavenRepo) {
  return withSettingsGradle(config, (mod) => {
    mod.modResults.contents = configureSettings(mod.modResults.contents, localMavenRepo);
    return mod;
  });
}

function withProjectRepos(config, localMavenRepo) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = stripExistingMarkers(mod.modResults.contents);
    const buildscript = injectIntoBlock(contents, /buildscript\s*\{/, { localMavenRepo });
    contents = buildscript.text;
    if (!buildscript.inserted) {
      contents = `buildscript {\n  repositories {\n${groovyMavenRepos({ localMavenRepo })}\n  }\n}\n\n${contents}`;
    }
    if (/allprojects\s*\{/.test(contents)) {
      contents = injectIntoBlock(contents, /allprojects\s*\{/, { localMavenRepo }).text;
    } else {
      contents += `\n\nallprojects {\n  repositories {\n${groovyMavenRepos({ localMavenRepo })}\n  }\n}\n`;
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

function chooseDistributionUrl(version, type) {
  const override = process.env.COFFER_GRADLE_DISTRIBUTION_URL;
  if (override) {
    return override;
  }
  return `${DEFAULT_DISTRIBUTION_BASE}gradle-${version}-${type}.zip`;
}

function configureWrapper(contents) {
  const match = /gradle-(\d+(?:\.\d+)*)-(bin|all)\.zip/.exec(contents);
  if (!match) {
    return contents;
  }
  const version = match[1];
  const type = match[2];
  const url = chooseDistributionUrl(version, type);
  let next = contents.replace(
    /^distributionUrl=.*$/m,
    `distributionUrl=${url.replace(/:/g, '\\:').replace(/\//g, '\\/')}`,
  );
  if (!/^networkTimeout=/m.test(next)) {
    next = next.replace(/^distributionUrl=.*$/m, '$&\nnetworkTimeout=60000');
  } else {
    next = next.replace(/^networkTimeout=.*$/m, 'networkTimeout=60000');
  }
  return next;
}

function withWrapperDistribution(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const wrapperPath = path.join(
        mod.modRequest.projectRoot,
        'android',
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );
      if (!fs.existsSync(wrapperPath)) {
        return mod;
      }
      const contents = fs.readFileSync(wrapperPath, 'utf8');
      fs.writeFileSync(wrapperPath, configureWrapper(contents), 'utf8');
      return mod;
    },
  ]);
}

module.exports = function withAndroidLocalRepos(config, options = {}) {
  const localMavenRepo = normalizeRepoPath(
    options.localMavenRepo === null
      ? null
      : options.localMavenRepo || 'D:/Env/maven/repository',
  );
  config = withSettingsRepos(config, localMavenRepo);
  config = withProjectRepos(config, localMavenRepo);
  config = withWrapperDistribution(config);
  return config;
};
