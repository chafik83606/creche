$ErrorActionPreference = 'Stop'
$token = $env:CODEMAGIC_API_TOKEN
if (-not $token) { throw 'Set CODEMAGIC_API_TOKEN before running this script.' }
$appId = '6a68cc145f247916f8b825c6'
$group = 'creche_android'
$headers = @{ 'x-auth-token' = $token }
$uri = "https://api.codemagic.io/apps/$appId/variables"

function Add-Var([string]$key, [string]$value, [bool]$secure = $false) {
  $payload = [ordered]@{
    key    = $key
    value  = $value
    group  = $group
    secure = $secure
  }
  $json = $payload | ConvertTo-Json -Compress
  Write-Host "Adding $key (len=$($value.Length))..."
  try {
    $res = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
    Write-Host "OK: $key"
    return $res
  } catch {
    Write-Host "FAIL: $key -> $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    throw
  }
}

Add-Var 'CM_KEY_ALIAS' 'creche' $false
Add-Var 'CM_KEYSTORE_PATH' '/tmp/keystore.keystore' $false
Add-Var 'CM_KEYSTORE_PASSWORD' 'BvKElbOIpnk12UjY0aC3hQFg' $true
Add-Var 'CM_KEY_PASSWORD' 'BvKElbOIpnk12UjY0aC3hQFg' $true

$b64 = Get-Content "$PSScriptRoot\..\mobile\.keystore.b64.tmp" -Raw
Add-Var 'CM_KEYSTORE' $b64 $true
Write-Host 'All variables uploaded.'
