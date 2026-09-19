<#
.SYNOPSIS
  Trae los respaldos cifrados del VPS a esta computadora.

.DESCRIPTION
  La copia diaria que hace el VPS vive en el mismo disco que la base: protege
  de un error, no de perder el servidor. Esto se trae las copias cifradas
  (.db.enc) y la caja fuerte con las claves, que es lo que hace falta para
  levantar ROOTLAB en otra máquina.

  TIRA, NO LE MANDAN. El VPS no sabe que esta computadora existe y no tiene
  credenciales para llegar acá: si alguien se mete en el servidor, no puede
  borrar ni pisar estas copias. Por eso el pedido sale de acá.

  Si la carpeta destino está adentro de OneDrive, con una sola pasada quedan
  las tres copias que hay que tener: el VPS, esta computadora y la nube.

.PARAMETER Destino
  Dónde guardarlas. Por defecto, OneDrive\Respaldos\ROOTLAB si hay OneDrive.

.PARAMETER Conservar
  Cuántas copias dejar. Por defecto 30.

.PARAMETER Instalar
  Deja una tarea programada que corre esto todos los días a las 9:15.

.EXAMPLE
  .\deploy\traer-respaldos.ps1
  .\deploy\traer-respaldos.ps1 -Destino D:\Respaldos\ROOTLAB -Conservar 60
  .\deploy\traer-respaldos.ps1 -Instalar
#>
[CmdletBinding()]
param(
  [string]$Destino = '',
  [string]$Servidor = 'root@31.97.31.58',
  [string]$Llave = "$env:USERPROFILE\.ssh\rootkit_vps",
  [string]$Remoto = '/var/lib/root-lab/respaldos',
  [int]$Conservar = 30,
  [switch]$Instalar
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Destino)) {
  if (Test-Path "$env:USERPROFILE\OneDrive") {
    $Destino = "$env:USERPROFILE\OneDrive\Respaldos\ROOTLAB"
  } else {
    $Destino = "$env:USERPROFILE\Respaldos\ROOTLAB"
  }
}

if ($Instalar) {
  # La tarea se registra con los mismos parámetros con los que se la llamó.
  $guion = $MyInvocation.MyCommand.Path
  $argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$guion`" -Destino `"$Destino`" -Conservar $Conservar"
  $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentos
  # 9:15 y no 9:00: si el respaldo del VPS es a las 4:30, a esta hora ya está.
  $cuando = New-ScheduledTaskTrigger -Daily -At 9:15am
  $opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
  Register-ScheduledTask -TaskName 'ROOTLAB respaldos' -Action $accion -Trigger $cuando `
    -Settings $opciones -Description 'Trae del VPS los respaldos cifrados de ROOTLAB.' -Force | Out-Null
  Write-Host "Tarea 'ROOTLAB respaldos' registrada: todos los días 9:15, a $Destino"
  Write-Host "  -StartWhenAvailable: si la compu estaba apagada, corre cuando prenda."
  Write-Host "  Se saca con: Unregister-ScheduledTask -TaskName 'ROOTLAB respaldos'"
  return
}

if (-not (Test-Path $Llave)) { throw "No encuentro la llave SSH en $Llave" }
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

Write-Host "Trayendo de $Servidor a $Destino"

# Sólo lo cifrado y la caja. Las copias .db sin cifrar se quedan en el VPS: no
# tienen por qué andar dando vueltas.
# scp escribe en stderr cuando un patrón no encuentra nada, y PowerShell
# convierte eso en un error que corta el script. Se llama a través de cmd,
# que devuelve el código de salida y se traga el ruido.
function Traer([string]$patron) {
  $destinoCmd = $Destino.TrimEnd([char]92)
  cmd /c "scp -q -i `"$Llave`" -o StrictHostKeyChecking=accept-new `"${Servidor}:$patron`" `"$destinoCmd`" 2>nul"
  return $LASTEXITCODE
}

if ((Traer "$Remoto/*.db.enc") -ne 0) {
  Write-Host "  no pude traer las copias cifradas: ¿hay alguna en el VPS?" -ForegroundColor Yellow
}
if ((Traer '/root/caja-fuerte.rkc') -ne 0) {
  Write-Host "  (todavía no hay caja fuerte en el VPS)" -ForegroundColor DarkGray
}

# Lo que llegó tiene que ser lo que decimos que es: los .enc empiezan con RKR1.
$copias = Get-ChildItem -Path $Destino -Filter '*.db.enc' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
$sanas = 0
$rotas = @()
foreach ($c in $copias) {
  $marca = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($c.FullName)[0..3])
  if ($marca -eq 'RKR1' -and $c.Length -gt 1024) { $sanas += 1 } else { $rotas += $c.Name }
}

# Y no se acumulan para siempre.
if ($copias.Count -gt $Conservar) {
  $viejas = $copias | Select-Object -Skip $Conservar
  foreach ($v in $viejas) { Remove-Item $v.FullName -Force }
  Write-Host "  borradas $($viejas.Count) copias viejas (se conservan $Conservar)"
}

$caja = Join-Path $Destino 'caja-fuerte.rkc'
$ultima = $copias | Select-Object -First 1

Write-Host ""
Write-Host "Copias acá: $($copias.Count) · sanas: $sanas"
if ($rotas.Count -gt 0) { Write-Host "  DAÑADAS: $($rotas -join ', ')" -ForegroundColor Red }
if ($ultima) {
  $dias = [math]::Round(((Get-Date) - $ultima.LastWriteTime).TotalDays, 1)
  Write-Host "Más reciente: $($ultima.Name) ($([math]::Round($ultima.Length/1KB)) KB, hace $dias días)"
  if ($dias -gt 3) { Write-Host "  OJO: hace más de tres días que no llega una copia nueva." -ForegroundColor Yellow }
} else {
  Write-Host "  No hay ninguna copia todavía." -ForegroundColor Yellow
}
if (Test-Path $caja) {
  Write-Host "Caja fuerte: sí (sin ella los respaldos no se pueden abrir)"
} else {
  Write-Host "Caja fuerte: NO ESTÁ. Sin ella estos respaldos no sirven de nada." -ForegroundColor Red
  Write-Host "  Se sella una sola vez, en el VPS (pide una frase que elijas vos):"
  Write-Host "    ssh -i ~/.ssh/rootkit_vps root@31.97.31.58"
  Write-Host "    /opt/root-lab-node/bin/node /opt/root-lab/tools/caja-fuerte.mjs sellar --salida /root/caja-fuerte.rkc"
}
if ($Destino -like "*OneDrive*") { Write-Host "En OneDrive: cuenta como copia en la nube además de en esta compu." }

# Código de salida, para que la tarea programada diga la verdad en su historial:
#   0  hay al menos una copia sana y la caja fuerte está
#   2  no llegó ninguna copia sana
#   3  hay copias pero falta la caja: no se podrían abrir
if ($sanas -eq 0) { exit 2 }
if (-not (Test-Path $caja)) { exit 3 }
exit 0
