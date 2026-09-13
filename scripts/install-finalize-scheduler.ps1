# MyLifeHistory - Finalize Scheduler 설치 (Windows Task Scheduler)
#
# 매일 03:30(Attempt 1)과 05:30(Attempt 2) 두 번, 저장된 Credential로
# 무인 Daily Finalize를 시도하는 Task 2개를 등록한다. targetDate는
# "실행 시점 기준 최근 24시간"이 아니라 항상 Asia/Seoul 기준 고정된
# "전날" 달력 하루이며, 이 계산은 scripts/run-production-real.mjs의
# getKstPreviousDateString()이 담당한다.
#
# 두 Attempt는 동일한 targetDate를 공유하며, Phase 12 Task 8의
# Finalize Run State(G:\...\99_SYSTEM\finalize_runs\YYYY-MM-DD.json)로
# 서로 조율된다:
#   - 03:30 결과가 COMPLETE / CREDENTIAL_ERROR / VALIDATOR_REJECTED /
#     RECOVERY_REQUIRED / HUMAN_REVIEW_REQUIRED 이면 05:30은 Production
#     호출 없이 즉시 종료한다.
#   - 03:30 결과가 PROVIDER_ERROR / WRITER_ERROR / NO_SOURCE 이면
#     05:30이 동일 targetDate로 한 번 더 시도한다.
#   - 05:30 이후에는 결과와 무관하게 그 날짜의 자동 처리를 종료한다 -
#     세 번째 시도, Backfill, 다음 날짜로의 carry-forward는 없다.
#
# 각 Task는 MultipleInstances = IgnoreNew 로 등록된다: 이전 시도가 아직
# 실행 중이면 새 인스턴스를 시작하지 않는다(기존 프로세스 강제 종료
# 없음, 동시 Finalize 실행 없음, 중복 Gemini 호출 없음). retry는
# RestartCount 0 으로 유지된다.
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

$taskNames = @{
    '03:30' = 'MyLifeHistory Finalize 0330'
    '05:30' = 'MyLifeHistory Finalize 0530'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot 'scripts\run-daily-finalize.ps1'
$credentialPath = Join-Path $env:LOCALAPPDATA 'MyLifeHistory\gemini-api-key.cred'

$alreadyExisting = @()
foreach ($name in $taskNames.Values) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
        $alreadyExisting += $name
    }
}

if ($alreadyExisting.Count -gt 0) {
    Write-Host '다음 Task가 이미 존재합니다. 아무것도 등록하지 않습니다(부분 등록 방지):'
    foreach ($name in $alreadyExisting) {
        Write-Host "  - $name"
    }
    Write-Host '다시 등록하려면 먼저 다음 명령으로 기존 Task를 제거하세요:'
    foreach ($name in $alreadyExisting) {
        Write-Host "  Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false"
    }
    exit 1
}

if (-not (Test-Path -LiteralPath $credentialPath)) {
    Write-Host 'FAIL: 저장된 Credential이 없습니다. 먼저 scripts/setup-automation-credential.ps1 을 실행하세요.'
    exit 1
}

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -RestartCount 0 -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

foreach ($time in @('03:30', '05:30')) {
    $taskName = $taskNames[$time]
    $argument = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -UseStoredCredential -ScheduledTime '$time'"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $projectRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At $time

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description "MyLifeHistory: 전날(Asia/Seoul 고정 달력 하루) Daily Finalize Attempt ($time), Finalize Run State로 게이트됨, retry 없음, IgnoreNew" | Out-Null

    Write-Host "등록됨: $taskName (매일 $time)"
}

Write-Host 'targetDate는 실행 시점 기준 Asia/Seoul 전날로 자동 계산됩니다 (rolling 24h 아님).'
Write-Host '두 Task는 동일 targetDate의 Finalize Run State를 공유하며 서로 조율됩니다.'
