<#
.SYNOPSIS
    Coffer 本地环境运维脚本（容器服务 + Electron 桌面端 + Android 移动端）。

.DESCRIPTION
    封装 scripts/docker-compose.yml 的常用操作：启动、停止、重启、重置、构建、日志、
    状态、进入 MySQL 客户端、重新执行初始化 SQL、拉取镜像。

    同时提供桌面端（Electron）与移动端（Expo / Android）的常用命令：开发模式、
    生成安装包、启动 Metro、编译安装、生成 APK、prebuild 与端口反向映射。

.PARAMETER Action
    要执行的操作，默认 status：
      up                 启动目标服务并等待就绪（API / Web 会先重新构建镜像）
      down               停止并移除全部容器（保留数据卷）
      restart            重启目标服务并等待就绪
      reset              删除数据卷后重新启动目标服务（会清空数据库与附件，需确认）
      build              重新构建 API / Web 镜像
      logs               查看目标服务日志
      cli                进入 MySQL 命令行
      status             查看容器状态与访问地址
      init               重新执行 docs/sql/coffer-v1.sql（会 DROP 并重建业务表，需确认）
      pull               拉取 MySQL / RustFS 镜像；API / Web 使用最新基础镜像重新构建
      desktop:dev        Electron 开发模式（先构建 @coffer/vault 依赖）
      desktop:make       生成 NSIS 安装包（apps/electron/out/make/）
      mobile:start       启动 Metro（:8081）
      mobile:android     编译并安装到已连接的 Android 设备
      mobile:apk:debug   生成 debug APK
      mobile:apk:release 生成 release APK
      mobile:prebuild    重新生成 android/ 原生工程（expo prebuild --clean）
      mobile:reverse     为模拟器映射 API(:3000) 与 Metro(:8081) 端口

    desktop:* / mobile:* 不依赖 Docker，不使用 -Target 与 -NoWait；Gradle 构建的
    完整日志会写入仓库根目录 logs/（已 gitignore）。

.PARAMETER Target
    操作目标，默认 all（仅容器相关操作使用，desktop:* / mobile:* 忽略）：
      mysql   仅 MySQL
      rustfs  仅 RustFS 对象存储
      api     仅 API（compose 会自动启动其依赖的 MySQL 与 RustFS）
      web     仅 Web（compose 会自动启动其依赖的 API、MySQL 与 RustFS）
      all     MySQL + RustFS + API + Web

.PARAMETER Force
    reset / init 跳过二次确认；build 时禁用 Docker 构建缓存。

.PARAMETER Follow
    logs 操作是否持续跟踪输出。

.PARAMETER Tail
    logs 显示的最后行数，默认 200。

.PARAMETER TimeoutSeconds
    up / restart / reset 等待健康检查的超时秒数，默认 90。

.PARAMETER NoWait
    up / restart / reset 启动后不等待健康检查。

.PARAMETER ApiBaseUrl
    mobile:apk:debug / mobile:apk:release 构建时内联的 API 地址（EXPO_PUBLIC_API_BASE_URL）。
    真机调试需填电脑的局域网地址（如 http://192.168.1.2:3000/api）；模拟器可省略，
    配合 mobile:reverse 使用默认的 127.0.0.1 即可。

.EXAMPLE
    pwsh ./manage.ps1 up

.EXAMPLE
    pwsh ./manage.ps1 up -Target mysql

.EXAMPLE
    pwsh ./manage.ps1 up -Target rustfs

.EXAMPLE
    pwsh ./manage.ps1 up -Target web

.EXAMPLE
    pwsh ./manage.ps1 build -Target web

.EXAMPLE
    pwsh ./manage.ps1 logs -Target api -Follow -Tail 500

.EXAMPLE
    pwsh ./manage.ps1 reset -Force

.EXAMPLE
    pwsh ./manage.ps1 init

.EXAMPLE
    pwsh ./manage.ps1 status -Target all

.EXAMPLE
    pwsh ./manage.ps1 desktop:dev

.EXAMPLE
    pwsh ./manage.ps1 desktop:make

.EXAMPLE
    pwsh ./manage.ps1 mobile:start

.EXAMPLE
    pwsh ./manage.ps1 mobile:android

.EXAMPLE
    pwsh ./manage.ps1 mobile:apk:release -ApiBaseUrl http://192.168.1.2:3000/api

.EXAMPLE
    pwsh ./manage.ps1 mobile:reverse
#>
#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet(
        'up', 'down', 'restart', 'reset', 'build', 'logs', 'cli', 'status', 'init', 'pull',
        'desktop:dev', 'desktop:make',
        'mobile:start', 'mobile:android', 'mobile:apk:debug', 'mobile:apk:release',
        'mobile:prebuild', 'mobile:reverse'
    )]
    [string]$Action = 'status',

    [ValidateSet('mysql', 'rustfs', 'api', 'web', 'all')]
    [string]$Target = 'all',

    [switch]$Force,
    [switch]$Follow,

    [ValidateRange(1, 10000)]
    [int]$Tail = 200,

    [ValidateRange(5, 600)]
    [int]$TimeoutSeconds = 90,

    [switch]$NoWait,

    [string]$ApiBaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# 统一以 UTF-8 输出，避免中文在重定向/管道中乱码
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptRoot = $PSScriptRoot
$ComposeFile = Join-Path $ScriptRoot 'scripts/docker-compose.yml'
$MonorepoRoot = Join-Path $ScriptRoot 'coffer-monorepo'
$LogsDir = Join-Path $ScriptRoot 'logs'
$ContainerNames = @{
    mysql  = 'coffer-mysql'
    rustfs = 'coffer-rustfs'
    api    = 'coffer-api'
    web    = 'coffer-web'
}

# 桌面端 / 移动端操作，不走 Docker 分支
$AppActions = @(
    'desktop:dev', 'desktop:make',
    'mobile:start', 'mobile:android', 'mobile:apk:debug', 'mobile:apk:release',
    'mobile:prebuild', 'mobile:reverse'
)

function Assert-Prerequisites {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw '未找到 docker 命令，请先安装并启动 Docker Desktop。'
    }

    if (-not (Test-Path -LiteralPath $ComposeFile)) {
        throw "未找到 compose 文件：$ComposeFile"
    }

    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw '当前 docker 不支持 compose v2，请升级 Docker Desktop。'
    }
}

function Invoke-Compose {
    param(
        [Parameter(Mandatory)]
        [string[]]$ComposeArgs
    )

    & docker compose --file $ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') 执行失败（退出码 $LASTEXITCODE）。"
    }
}

function Assert-NodePrerequisites {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw '未找到 pnpm 命令，请先安装 Node.js，并执行 corepack enable（或 npm install -g pnpm）。'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $MonorepoRoot 'package.json'))) {
        throw "未找到 monorepo 目录：$MonorepoRoot"
    }
}

function Invoke-Pnpm {
    param(
        [Parameter(Mandatory)]
        [string[]]$PnpmArgs,

        # 指定后把完整输出（含 Gradle 进度）同步写入仓库根目录 logs/ 下的日志文件
        [string]$LogName
    )

    Push-Location $MonorepoRoot
    $previousPreference = $ErrorActionPreference
    try {
        # Gradle 会往 stderr 写大量进度信息，临时放宽避免被当成终止错误
        $ErrorActionPreference = 'Continue'

        if ($LogName) {
            if (-not (Test-Path -LiteralPath $LogsDir)) {
                New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
            }
            $logPath = Join-Path $LogsDir $LogName
            Write-Host "完整日志：$logPath" -ForegroundColor DarkGray
            & pnpm @PnpmArgs 2>&1 | Tee-Object -FilePath $logPath
        }
        else {
            & pnpm @PnpmArgs
        }

        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
        Pop-Location
    }

    if ($exitCode -ne 0) {
        throw "pnpm $($PnpmArgs -join ' ') 执行失败（退出码 $exitCode）。"
    }
}

function Invoke-MobileBuild {
    param(
        [Parameter(Mandatory)]
        [string]$PnpmScript,

        [Parameter(Mandatory)]
        [string]$LogName,

        [Parameter(Mandatory)]
        [string]$ApkPath
    )

    # EXPO_PUBLIC_* 会在 export:embed 阶段内联进 JS bundle，构建结束后恢复原值
    $previousApiBaseUrl = $env:EXPO_PUBLIC_API_BASE_URL
    try {
        if ($ApiBaseUrl) {
            $env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl
            Write-Host "EXPO_PUBLIC_API_BASE_URL=$ApiBaseUrl" -ForegroundColor Cyan
        }

        Invoke-Pnpm -PnpmArgs @($PnpmScript) -LogName $LogName
    }
    finally {
        $env:EXPO_PUBLIC_API_BASE_URL = $previousApiBaseUrl
    }

    Write-Host "APK 输出：$ApkPath" -ForegroundColor Green
}

function Invoke-AdbReverse {
    if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
        throw '未找到 adb 命令，请把 Android SDK 的 platform-tools 目录加入 PATH。'
    }

    & adb get-state *> $null
    if ($LASTEXITCODE -ne 0) {
        throw '未检测到已连接的 Android 设备或模拟器。'
    }

    foreach ($port in 3000, 8081) {
        & adb reverse "tcp:$port" "tcp:$port"
        if ($LASTEXITCODE -ne 0) {
            throw "adb reverse tcp:$port 失败（退出码 $LASTEXITCODE）。"
        }
    }

    Write-Host '已映射：API 127.0.0.1:3000、Metro 127.0.0.1:8081。' -ForegroundColor Green
}

function Invoke-AppAction {
    Assert-NodePrerequisites

    switch ($Action) {
        'desktop:dev' {
            Invoke-Pnpm -PnpmArgs @('desktop:dev')
        }

        'desktop:make' {
            Invoke-Pnpm -PnpmArgs @('desktop:make')
            Write-Host "安装包输出：$(Join-Path $MonorepoRoot 'apps/electron/out/make')" -ForegroundColor Green
        }

        'mobile:start' {
            Write-Host '模拟器访问本机 API / Metro 前先执行：pwsh ./manage.ps1 mobile:reverse' -ForegroundColor DarkGray
            Invoke-Pnpm -PnpmArgs @('mobile:start')
        }

        'mobile:android' {
            Invoke-Pnpm -PnpmArgs @('mobile:android') -LogName 'gradle-rn-android.log'
            Write-Host '若模拟器需访问本机 API，执行：pwsh ./manage.ps1 mobile:reverse' -ForegroundColor DarkGray
        }

        'mobile:apk:debug' {
            Invoke-MobileBuild -PnpmScript 'mobile:apk:debug' -LogName 'gradle-rn-debug.log' `
                -ApkPath (Join-Path $MonorepoRoot 'apps/rn/android/app/build/outputs/apk/debug/app-debug.apk')
        }

        'mobile:apk:release' {
            Invoke-MobileBuild -PnpmScript 'mobile:apk:release' -LogName 'gradle-rn-release.log' `
                -ApkPath (Join-Path $MonorepoRoot 'apps/rn/android/app/build/outputs/apk/release/app-release.apk')
        }

        'mobile:prebuild' {
            Invoke-Pnpm -PnpmArgs @('--filter', '@coffer/rn', 'prebuild:android') -LogName 'expo-prebuild.log'
        }

        'mobile:reverse' {
            Invoke-AdbReverse
        }
    }
}

function Get-TargetServices {
    switch ($Target) {
        'mysql' { return @('mysql') }
        'rustfs' { return @('rustfs') }
        'api' { return @('api') }
        'web' { return @('web') }
        default { return @('mysql', 'rustfs', 'api', 'web') }
    }
}

# 服务依赖：等待就绪时连同 compose 自动启动的上游服务一起检查
function Get-WaitServices {
    $services = Get-TargetServices
    $result = @()
    if ($services -contains 'mysql' -or $services -contains 'api' -or $services -contains 'web') {
        $result += 'mysql'
    }
    if ($services -contains 'rustfs' -or $services -contains 'api' -or $services -contains 'web') {
        $result += 'rustfs'
    }
    if ($services -contains 'api' -or $services -contains 'web') {
        $result += 'api'
    }
    if ($services -contains 'web') {
        $result += 'web'
    }
    return $result
}

function Get-ContainerHealth {
    param(
        [Parameter(Mandatory)]
        [string]$ContainerName
    )

    $result = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $ContainerName 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    return ($result | Select-Object -First 1)
}

function Wait-ContainerHealthy {
    param(
        [Parameter(Mandatory)]
        [string]$ContainerName,

        [Parameter(Mandatory)]
        [string]$DisplayName
    )

    if ($NoWait) {
        Write-Host '已跳过健康检查等待。' -ForegroundColor DarkGray
        return
    }

    Write-Host "等待 $DisplayName 就绪（最长 ${TimeoutSeconds}s）..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $status = Get-ContainerHealth -ContainerName $ContainerName

        switch ($status) {
            'healthy' {
                Write-Host "$DisplayName 已就绪。" -ForegroundColor Green
                return
            }
            'running' {
                # 未配置 healthcheck 的服务（RustFS），容器运行即视为就绪
                Write-Host "$DisplayName 已启动。" -ForegroundColor Green
                return
            }
            'unhealthy' {
                throw "$DisplayName 健康检查失败，请执行：pwsh ./manage.ps1 logs -Target $Target -Follow"
            }
            default {
                Start-Sleep -Seconds 2
            }
        }
    }

    throw "等待 $DisplayName 就绪超时（${TimeoutSeconds}s），请执行：pwsh ./manage.ps1 logs -Target $Target -Follow"
}

function Wait-TargetHealthy {
    foreach ($service in (Get-WaitServices)) {
        $displayName = switch ($service) {
            'mysql' { 'MySQL' }
            'rustfs' { 'RustFS' }
            'api' { 'API' }
            'web' { 'Web' }
            default { $service }
        }
        Wait-ContainerHealthy -ContainerName $ContainerNames[$service] -DisplayName $displayName
    }
}

function Confirm-Destructive {
    param(
        [Parameter(Mandatory)]
        [string]$Message
    )

    if ($Force) {
        return
    }

    $answer = Read-Host "$Message 输入 YES 继续"
    if ($answer -ne 'YES') {
        Write-Host '已取消。' -ForegroundColor Yellow
        exit 0
    }
}

function Invoke-MySqlInit {
    Write-Host '重新执行初始化 SQL（会 DROP 并重建 Coffer 业务表）...' -ForegroundColor Cyan
    Invoke-Compose -ComposeArgs @(
        'exec', '-T', 'mysql', 'sh', '-c',
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE" < /docker-entrypoint-initdb.d/01-coffer-v1.sql'
    )
    Write-Host '初始化完成。' -ForegroundColor Green
}

function Assert-TargetIncludes {
    param(
        [Parameter(Mandatory)]
        [string]$Service,
        [Parameter(Mandatory)]
        [string]$ActionName
    )

    $services = Get-TargetServices
    if ($services -notcontains $Service) {
        throw "$ActionName 需要目标包含 $Service，请使用 -Target $Service 或 -Target all。"
    }
}

# desktop:* / mobile:* 只依赖 Node 工具链，不需要 Docker
if ($AppActions -contains $Action) {
    Invoke-AppAction
    exit 0
}

Assert-Prerequisites

switch ($Action) {
    'up' {
        $services = Get-TargetServices
        $upArgs = @('up', '-d')
        if ($services -contains 'api' -or $services -contains 'web') {
            # 本地开发时确保使用最新代码构建 API / Web
            $upArgs += '--build'
        }
        $upArgs += $services
        Invoke-Compose -ComposeArgs $upArgs
        Wait-TargetHealthy
    }

    'down' {
        # down 作用于整个 compose 项目，-Target 不参与
        Invoke-Compose -ComposeArgs @('down')
    }

    'restart' {
        $services = Get-TargetServices
        Invoke-Compose -ComposeArgs (@('restart') + $services)
        Wait-TargetHealthy
    }

    'reset' {
        Confirm-Destructive -Message '将删除 MySQL 与 RustFS 数据卷，数据库和全部密文附件都会丢失。'
        Invoke-Compose -ComposeArgs @('down', '-v')

        $services = Get-TargetServices
        $upArgs = @('up', '-d')
        if ($services -contains 'api' -or $services -contains 'web') {
            $upArgs += '--build'
        }
        $upArgs += $services
        Invoke-Compose -ComposeArgs $upArgs
        Wait-TargetHealthy
    }

    'build' {
        $services = Get-TargetServices
        $buildServices = @($services | Where-Object { $_ -in @('api', 'web') })
        if ($buildServices.Count -eq 0) {
            throw 'build 需要目标包含 api 或 web，请使用 -Target api、web 或 all。'
        }
        $buildArgs = @('build')
        if ($Force) {
            $buildArgs += '--no-cache'
        }
        $buildArgs += $buildServices
        Invoke-Compose -ComposeArgs $buildArgs
    }

    'logs' {
        $logArgs = @('logs', '--tail', "$Tail")
        if ($Follow) {
            $logArgs += '-f'
        }
        $logArgs += Get-TargetServices
        Invoke-Compose -ComposeArgs $logArgs
    }

    'cli' {
        Assert-TargetIncludes -Service 'mysql' -ActionName 'cli'
        Invoke-Compose -ComposeArgs @(
            'exec', 'mysql', 'sh', '-c',
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
        )
    }

    'status' {
        Invoke-Compose -ComposeArgs @('ps')

        foreach ($service in Get-TargetServices) {
            $container = $ContainerNames[$service]
            $health = Get-ContainerHealth -ContainerName $container

            if ($null -eq $health) {
                Write-Host "$service（$container）尚未创建，执行 up 启动。" -ForegroundColor Yellow
                continue
            }

            $color = if ($health -eq 'healthy' -or $health -eq 'running') {
                'Green'
            }
            elseif ($health -eq 'unhealthy') {
                'Red'
            }
            else {
                'Yellow'
            }
            Write-Host "$service（$container）状态：$health" -ForegroundColor $color
        }

        if ((Get-TargetServices) -contains 'api' -or $Target -eq 'all') {
            Write-Host ''
            Write-Host '访问地址：' -ForegroundColor Cyan
            Write-Host '  Web          http://localhost:8080'
            Write-Host '  API 文档     http://localhost:3000/api/docs'
            Write-Host '  RustFS 控制台 http://localhost:9001'
        }
    }

    'init' {
        Assert-TargetIncludes -Service 'mysql' -ActionName 'init'
        Confirm-Destructive -Message '将重新执行初始化 SQL，DROP 并重建 Coffer 业务表。'
        Invoke-MySqlInit
    }

    'pull' {
        $services = Get-TargetServices
        if ($services -contains 'mysql') {
            Invoke-Compose -ComposeArgs @('pull', 'mysql')
        }
        if ($services -contains 'rustfs') {
            Invoke-Compose -ComposeArgs @('pull', 'rustfs')
        }
        if ($services -contains 'api') {
            Invoke-Compose -ComposeArgs @('build', '--pull', 'api')
        }
        if ($services -contains 'web') {
            Invoke-Compose -ComposeArgs @('build', '--pull', 'web')
        }
    }
}
