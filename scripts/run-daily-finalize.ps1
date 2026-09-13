# MyLifeHistory Daily Finalize - 비개발자용 실행 스크립트
#
# 사용법 (수동 입력, 기본):
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-daily-finalize.ps1
#
# 사용법 (Windows Task Scheduler 등 무인 실행용, 저장된 Credential 사용):
#   powershell -ExecutionPolicy Bypass -File .\scripts\run-daily-finalize.ps1 -UseStoredCredential
#   (사전에 scripts/setup-automation-credential.ps1 로 Credential을 먼저 등록해야 한다.)
#
# -PreviousDay 를 추가하면 targetDate가 "실행 시점 기준 최근 24시간"이
# 아니라 Asia/Seoul 기준 고정된 "전날" 달력 하루로 지정된다. 계산은
# run-production-real.mjs의 getKstPreviousDateString()이 담당한다.
#
# -ScheduledTime '03:30' 또는 '05:30' 을 추가하면(-PreviousDay 는 자동
# 포함되어 별도로 줄 필요 없음) Phase 12 Task 8의 Finalize Run State
# 게이트를 사용하는 무인 실행 모드로 동작한다: 같은 targetDate에 이미
# 종료 상태(COMPLETE/CREDENTIAL_ERROR/VALIDATOR_REJECTED/
# RECOVERY_REQUIRED/HUMAN_REVIEW_REQUIRED)가 기록되어 있거나 이미 2회
# 시도했다면 Production 호출 없이 즉시 종료하고, 그렇지 않으면 1회
# 실행 후 결과를 finalize_runs/YYYY-MM-DD.json에 기록한다.
#
# 이 스크립트는 Gemini API Key를 얻어(수동 입력 또는 저장된 Credential),
# 제어 문자가 섞여 있으면(잘못된 붙여넣기 등) API 호출 전에 중단하고,
# 정상이면 node scripts/run-production-real.mjs 를 1회 실행한 뒤
# 성공/실패와 관계없이 Credential을 환경 변수에서 즉시 제거한다.
#
# Provider/Pipeline/Prompt/State 로직은 전혀 포함하지 않는다 - 기존
# scripts/run-production-real.mjs 를 그대로 호출할 뿐이다.

param(
    [switch]$UseStoredCredential,
    [switch]$PreviousDay,
    [string]$ScheduledTime
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$exitCode = 1

$credentialPath = Join-Path $env:LOCALAPPDATA 'MyLifeHistory\gemini-api-key.cred'
$productionEntryPath = Join-Path $PSScriptRoot 'run-production-real.mjs'

function ConvertFrom-SecureStringPlain {
    param([System.Security.SecureString]$Secure)
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Test-HasControlChar {
    param([string]$Value)
    foreach ($ch in $Value.ToCharArray()) {
        $code = [int][char]$ch
        if ($code -lt 32 -or $code -eq 127) {
            return $true
        }
    }
    return $false
}

Write-Host 'MyLifeHistory Daily Finalize'
$plainKey = $null

try {
    $abortMessage = $null

    if ($UseStoredCredential) {
        if (-not (Test-Path -LiteralPath $credentialPath)) {
            $abortMessage = 'FAIL: 저장된 Credential을 찾을 수 없습니다. 먼저 scripts/setup-automation-credential.ps1 을 실행하세요.'
        }
        else {
            try {
                $encrypted = (Get-Content -LiteralPath $credentialPath -Raw).Trim()
                $storedSecureKey = ConvertTo-SecureString -String $encrypted
                $plainKey = ConvertFrom-SecureStringPlain -Secure $storedSecureKey
            }
            catch {
                $plainKey = $null
                $abortMessage = 'FAIL: 저장된 Credential을 복호화할 수 없습니다. 현재 Windows 계정에서 등록한 것인지 확인하세요.'
            }
        }
    }
    else {
        Write-Host 'Gemini API Key를 입력하세요 (입력값은 화면에 표시되지 않습니다):'
        $secureKey = Read-Host -AsSecureString
        $plainKey = ConvertFrom-SecureStringPlain -Secure $secureKey
    }

    if ($abortMessage) {
        Write-Host $abortMessage
    }
    elseif ([string]::IsNullOrEmpty($plainKey)) {
        Write-Host 'FAIL: API Key가 비어 있습니다.'
    }
    elseif (Test-HasControlChar -Value $plainKey) {
        Write-Host 'FAIL: API Key에 허용되지 않는 제어 문자가 포함되어 있습니다. 붙여넣기 과정을 확인한 뒤 다시 시도하세요.'
    }
    else {
        Write-Host 'Credential 확인: OK (값은 표시되지 않음)'
        $env:MYLIFEHISTORY_GEMINI_API_KEY = $plainKey

        if ($ScheduledTime) {
            node $productionEntryPath --scheduled-time=$ScheduledTime
        }
        elseif ($PreviousDay) {
            node $productionEntryPath --previous-day
        }
        else {
            node $productionEntryPath
        }
        $exitCode = $LASTEXITCODE
    }
}
finally {
    if (Test-Path Env:MYLIFEHISTORY_GEMINI_API_KEY) {
        Remove-Item Env:MYLIFEHISTORY_GEMINI_API_KEY -ErrorAction SilentlyContinue
    }
    $plainKey = $null
    Write-Host 'Credential 제거 완료'
}

Write-Host "Pipeline exit code: $exitCode"
exit $exitCode
