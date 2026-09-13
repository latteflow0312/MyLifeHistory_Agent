# MyLifeHistory - Collection Scheduler 설치 (Windows Task Scheduler)
#
# 하루 2회(08:00, 18:00) 01_RAW의 신규 Source 개수만 확인하는 읽기 전용
# Collection Task를 등록한다. Daily Finalize 실행, Gemini/API 호출,
# Processing State 변경, 실패 시 자동 재시도 - 모두 하지 않는다
# (scripts/run-collection-check.mjs 참고).
#
# 이 스크립트는 "등록"만 한다 - 실제 Task Scheduler 등록은 사용자가 이
# 스크립트를 직접 실행해야 이루어진다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-collection-scheduler.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$taskName = 'MyLifeHistory Collection'
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot 'scripts\run-collection-check.mjs'
$logDir = Join-Path $env:LOCALAPPDATA 'MyLifeHistory'
$logPath = Join-Path $logDir 'collection-check.log'

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "이미 '$taskName' Task가 존재합니다. 덮어쓰지 않습니다."
    Write-Host "현재 상태: $($existing.State)"
    try {
        $info = Get-ScheduledTaskInfo -TaskName $taskName
        Write-Host "다음 실행 예정: $($info.NextRunTime)"
    }
    catch {
        # 정보 조회 실패는 무시 - 이미 존재한다는 사실 자체가 중요하다.
    }
    Write-Host "다시 등록하려면 먼저 다음 명령으로 기존 Task를 제거하세요:"
    Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
    exit 1
}

if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$argument = "/c cd /d `"$projectRoot`" && node `"$scriptPath`" >> `"$logPath`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $argument -WorkingDirectory $projectRoot

$trigger08 = New-ScheduledTaskTrigger -Daily -At '08:00'
$trigger18 = New-ScheduledTaskTrigger -Daily -At '18:00'

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -RestartCount 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigger08, $trigger18) `
    -Principal $principal -Settings $settings `
    -Description 'MyLifeHistory: 01_RAW 신규 기록 개수 확인 (읽기 전용, API 호출/Finalize/State 변경 없음)' | Out-Null

Write-Host "등록됨: $taskName (매일 08:00, 18:00)"
Write-Host "로그 위치: $logPath"
