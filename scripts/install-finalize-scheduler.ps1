# MyLifeHistory - Finalize Scheduler 설치 (Windows Task Scheduler)
#
# 매일 03:30 단 한 번, 저장된 Credential로 무인 Daily Finalize를
# 실행하는 Task 1개를 등록한다. targetDate는 "실행 시점 기준 최근
# 24시간"이 아니라 항상 Asia/Seoul 기준 고정된 "전날" 달력 하루이며,
# 이 계산은 scripts/run-production-real.mjs의
# getKstPreviousDateString()이 담당한다 (run-daily-finalize.ps1의
# -PreviousDay 스위치를 통해 사용됨).
#
# 이 Task는 자동 재시도를 하지 않는다: 실패하면 그 날짜의 처리는
# 그대로 실패로 남고, 사람이 직접 확인 후 수동으로 다시 실행해야 한다
# (03:30 두 번째 시도, 다른 시각의 Backfill 등은 만들지 않는다).
#
# Task는 MultipleInstances = IgnoreNew 로 등록된다: 이전 실행이 아직
# 끝나지 않았으면 새 인스턴스를 시작하지 않는다(기존 프로세스 강제
# 종료 없음, 동시 Finalize 실행 없음, 중복 Gemini 호출 없음).
# RestartCount 는 0으로 유지되어 Windows Task Scheduler 자체도 실패
# 시 재시작하지 않는다.
#
# 이 스크립트는 "등록"만 한다 - 실제 Task Scheduler 등록은 사용자가 이
# 스크립트를 직접 실행해야 이루어진다(자동화 PC에서만, 개발PC에는
# 등록하지 않는다). 실행 전에 반드시
# scripts/setup-automation-credential.ps1 로 Credential을 먼저
# 등록해야 한다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-finalize-scheduler.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$taskName = 'MyLifeHistory Daily Finalize'
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot 'scripts\run-daily-finalize.ps1'
$credentialPath = Join-Path $env:LOCALAPPDATA 'MyLifeHistory\gemini-api-key.cred'

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
    Write-Host '다시 등록하려면 먼저 다음 명령으로 기존 Task를 제거하세요:'
    Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
    exit 1
}

if (-not (Test-Path -LiteralPath $credentialPath)) {
    Write-Host 'FAIL: 저장된 Credential이 없습니다. 먼저 scripts/setup-automation-credential.ps1 을 실행하세요.'
    exit 1
}

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -UseStoredCredential -PreviousDay"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At '03:30'
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -RestartCount 0 -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'MyLifeHistory: 전날(Asia/Seoul 고정 달력 하루) Daily Finalize, 하루 1회, retry 없음, IgnoreNew' | Out-Null

Write-Host "등록됨: $taskName (매일 03:30)"
Write-Host 'targetDate는 실행 시점 기준 Asia/Seoul 전날로 자동 계산됩니다 (rolling 24h 아님).'
Write-Host '이 Task는 실패해도 자동으로 재시도하지 않습니다.'
