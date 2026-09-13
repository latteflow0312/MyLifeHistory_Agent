# MyLifeHistory - Morning Report Scheduler 설치 (Windows Task Scheduler)
#
# 매일 07:30에 scripts/run-morning-report.mjs를 실행해, 전날(Asia/Seoul
# 고정 달력 하루) Finalize 결과를 읽고 Morning Report를 만드는 Task를
# 등록한다. 이 Task는 Gemini를 호출하지 않고, 실제 Email/Telegram
# 전송도 하지 않는다(그 부분은 이후 Task에서 실제 Credential과 함께
# 연결된다) - 지금은 Report 생성 로직만 실행/기록(콘솔 출력)한다.
#
# 이 스크립트는 "등록"만 한다 - 실제 Task Scheduler 등록은 사용자가 이
# 스크립트를 직접 실행해야 이루어진다(자동화 PC에서만, 개발PC에는
# 등록하지 않는다). Gemini Credential이 필요 없으므로
# setup-automation-credential.ps1 등록 여부와 무관하게 실행 가능하다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-morning-report-scheduler.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$taskName = 'MyLifeHistory Morning Report'
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $projectRoot 'scripts\run-morning-report.mjs'
$logDir = Join-Path $env:LOCALAPPDATA 'MyLifeHistory'
$logPath = Join-Path $logDir 'morning-report.log'

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

$trigger = New-ScheduledTaskTrigger -Daily -At '07:30'
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -RestartCount 0 -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'MyLifeHistory: 전날 Finalize 결과로 Morning Report 생성(Gemini 호출 없음, 실제 알림 전송 없음)' | Out-Null

Write-Host "등록됨: $taskName (매일 07:30)"
Write-Host "로그 위치: $logPath"
Write-Host '이 Task는 아직 실제 Email/Telegram을 전송하지 않습니다.'
