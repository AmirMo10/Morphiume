[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$morphiumeConfigDirectory = Join-Path $PSScriptRoot '.local'
$morphiumeComposeFile = Join-Path $PSScriptRoot 'compose.local.yaml'

& docker info --format '{{.OSType}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'A running local Linux Docker daemon is required.' }
& docker volume inspect morphiume-dev-pg18 2>$null | Out-Null
$morphiumeVolumeExists = $LASTEXITCODE -eq 0
$morphiumeConnectionFile = Join-Path $morphiumeConfigDirectory 'database.json'
if ($morphiumeVolumeExists -and -not (Test-Path -LiteralPath $morphiumeConnectionFile)) {
  throw 'Existing developer database volume has no connection file. Recover credentials; do not reset or regenerate them.'
}

if (-not (Test-Path -LiteralPath $morphiumeConnectionFile)) {
  New-Item -ItemType Directory -Path $morphiumeConfigDirectory -Force | Out-Null
  $morphiumeIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $morphiumeAcl = [System.Security.AccessControl.DirectorySecurity]::new()
  $morphiumeAcl.SetAccessRuleProtection($true, $false)
  $morphiumeAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($morphiumeIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  Set-Acl -LiteralPath $morphiumeConfigDirectory -AclObject $morphiumeAcl
  $morphiumeSecrets = @{}
  foreach ($morphiumeSecretName in @('db_bootstrap_password','db_owner_password','db_app_password')) {
    $morphiumeBytes = New-Object byte[] 32
    $morphiumeRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $morphiumeRng.GetBytes($morphiumeBytes) } finally { $morphiumeRng.Dispose() }
    $morphiumeSecret = -join ($morphiumeBytes | ForEach-Object { $_.ToString('x2') })
    $morphiumeSecrets[$morphiumeSecretName] = $morphiumeSecret
    [System.IO.File]::WriteAllText((Join-Path $morphiumeConfigDirectory $morphiumeSecretName), $morphiumeSecret, [System.Text.UTF8Encoding]::new($false))
  }
  $morphiumeConnections = @{
    databaseUrl = "postgresql://morphiume_staging_app:$($morphiumeSecrets.db_app_password)@127.0.0.1:5433/morphiume_staging"
    migrationDatabaseUrl = "postgresql://morphiume_staging_owner:$($morphiumeSecrets.db_owner_password)@127.0.0.1:5433/morphiume_staging"
  }
  [System.IO.File]::WriteAllText($morphiumeConnectionFile, ($morphiumeConnections | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
}
& docker compose -p morphiume-dev -f $morphiumeComposeFile config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Developer database Compose validation failed.' }
& docker compose -p morphiume-dev -f $morphiumeComposeFile up -d --wait --wait-timeout 180 db
if ($LASTEXITCODE -ne 0) { throw 'Developer database startup failed; inspect redacted service logs.' }
Write-Output 'Isolated developer PostgreSQL is healthy at loopback port 5433. Connection file: deploy/staging/.local/database.json (ignored; do not print or commit).'
