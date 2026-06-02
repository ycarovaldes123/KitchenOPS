
# -- Genera SQL de migracion para produccion y mermas del 25/05 en adelante --
$excelPath  = "C:\Users\kunstmann\Desktop\SaaS\KitchenOPS\PEDIDOS PRODUCCION EN PROCESO 2026 ACTUALIZAR.xlsx"
$outputPath = "C:\Users\kunstmann\Desktop\SaaS\KitchenOPS\kitchenops\scripts\migrate_produccion_may25.sql"

function SqlStr($s) {
    if ($null -eq $s -or "$s" -eq '') { return 'NULL' }
    return ("'{0}'" -f ("$s".Replace("'", "''")))
}
function SqlNum($n) {
    if ($null -eq $n) { return 'NULL' }
    return "$n"
}
function ExcelToDate($serial) {
    if ($serial -is [double]) { return [DateTime]::FromOADate($serial).ToString("yyyy-MM-dd") }
    return $null
}

# Normaliza nombre PP: trim, UPPER, colapsa espacios, reemplaza acentos por ASCII
function NormPP($s) {
    if ($null -eq $s) { return '' }
    $r = $s.ToString().Trim().ToUpper() -replace '\s+', ' '
    # Reemplazar vocales acentuadas y enye
    $r = $r.Replace([char]0x00D1, 'N')   # N con tilde mayuscula
    $r = $r.Replace([char]0x00F1, 'N')   # n con tilde minuscula
    $r = $r.Replace([char]0x00C1, 'A')   # A con tilde
    $r = $r.Replace([char]0x00E1, 'A')
    $r = $r.Replace([char]0x00C9, 'E')   # E con tilde
    $r = $r.Replace([char]0x00E9, 'E')
    $r = $r.Replace([char]0x00CD, 'I')   # I con tilde
    $r = $r.Replace([char]0x00ED, 'I')
    $r = $r.Replace([char]0x00D3, 'O')   # O con tilde
    $r = $r.Replace([char]0x00F3, 'O')
    $r = $r.Replace([char]0x00DA, 'U')   # U con tilde
    $r = $r.Replace([char]0x00FA, 'U')
    return $r
}

# -- Responsables (nombre en mayusculas -> UUID) -------------------------------
$respMap = @{}
$respMap['PAULINA TRONCOSO']  = '17e16177-97ff-4ced-ac58-c78481875d8d'
$respMap['PAMELA COLIHUINCA'] = '209d4394-5456-404f-b810-f15c1e35ffc4'
$respMap['LUISA FLANDEZ']     = 'd3628a73-094e-4013-972d-330916e16c51'
$respMap['FELIPE VIDAL']      = 'ee204df1-17cb-491b-bb46-f611da02cdb0'
$respMap['JOEL MENDEZ']       = 'e00fe30c-037c-4f9a-a6d3-c0e28a1eee2b'
$respMap['JAVIERA SEPULVEDA'] = '6c007822-2a09-4bb8-afc1-5705de388503'
$respMap['PIA TELLO']         = '768c633e-afd8-4dca-8cd6-4fe46979d8f2'
$respMap['YONATAN CARO']      = '697ff4c1-c928-4a05-abcd-aa4528273cc1'

# -- PP Map: nombre NORMALIZADO (sin acentos) -> {id, tipo, gpp, cod} ---------
# NOTA: las claves usan N en lugar de la enye (N con tilde) y sin acentos
$ppMap = @{}
$ppMap['PP ARROZ BLANCO GRS']                = @{id='98e65ec5-e68f-4bb4-9c00-2d209e20fed8';tipo='PORCION';gpp=200;cod='0502015'}
$ppMap['PP BABY RIBS UND']                   = @{id='16a1c926-6eba-462b-bf2e-6c9ffe016585';tipo='UND';gpp=1;cod='0502023'}
$ppMap['PP BECHAMEL DE QUESO MANTECOSO GRS'] = @{id='e0ec08ce-f4c8-4217-a645-8f030fe51bb4';tipo='PORCION';gpp=100;cod='0502073'}
$ppMap['PP BROCHETAS (UND)']                 = @{id='4bb08b4e-51c9-4716-a5b6-65de2955f8cf';tipo='UND';gpp=1;cod='0502263'}
$ppMap['PP CARNE TABLA (UND)']               = @{id='8eb3db8c-0344-49f8-9a63-0b8535747f79';tipo='PORCION';gpp=0.2;cod='0301044'}
$ppMap['PP CEBOLLA CARAMELIZADA GRS']        = @{id='b0e2a8ba-a008-4d9d-b001-b807633353b6';tipo='DIRECTO';gpp=$null;cod='0502013'}
$ppMap['PP CHAMPINON RELLENO (UND)']         = @{id='3080dc0e-4d77-414b-acf6-158d0c593635';tipo='UND';gpp=1;cod='0502039'}
$ppMap['PP CIERVO PORC']                     = @{id='b2f2b6e7-eea7-4f61-a2aa-ad777e72cc31';tipo='PORCION';gpp=1;cod='0502027'}
$ppMap['PP CIERVO SIN PEPINILLOS']           = @{id='80ec5a5b-4830-4a1c-89cd-b6e7a8b48169';tipo='UND';gpp=1;cod=$null}
$ppMap['PP ENTRANA PR']                      = @{id='481a74d8-f1a3-44e2-a4b7-018adf2e783a';tipo='PORCION';gpp=400;cod=$null}
$ppMap['PP FILETE DE POLLO']                 = @{id='f716067e-548d-46b0-b27c-5c1d85bcc857';tipo='PORCION';gpp=200;cod='0302001'}
$ppMap['PP GOULASH']                         = @{id='ad90f6c1-d2f2-4b23-9aee-89a1517da7e8';tipo='PORCION';gpp=250;cod=$null}
$ppMap['PP HAMBURGUESA DE GARBANZO UND']     = @{id='8c1f90ad-f656-4515-b902-5519a1dbb71d';tipo='UND';gpp=1;cod='0502038'}
$ppMap['PP JUGO DE FRAMBUESA CC']            = @{id='81f53f0d-77a8-4157-8182-2da401c3cd06';tipo='DIRECTO';gpp=$null;cod='0502175'}
$ppMap['PP JUGO DE MANGO (CC) CC']           = @{id='0b909229-993a-4982-9c3a-028e1392966a';tipo='DIRECTO';gpp=$null;cod='0502175'}
$ppMap['PP JUGO DE PINA (CC) CC']            = @{id='393f747d-c4a3-4c28-8b6d-57311b34d5ef';tipo='DIRECTO';gpp=$null;cod='0502175'}
$ppMap['PP LIMONETA DE CERVEZA CC']          = @{id='ace523ad-12a9-41bf-b3d0-bd89ef85ac9e';tipo='DIRECTO';gpp=$null;cod='0502010'}
$ppMap['PP MAYO AJO CABRA (STRONG) GRS']     = @{id='46224f99-961f-4e05-8054-ff33ae9742a1';tipo='DIRECTO';gpp=$null;cod='0502234'}
$ppMap['PP MAYONESA CASERA GRS']             = @{id='0f044da1-b1f4-46dc-a04d-c4dbde8b0592';tipo='DIRECTO';gpp=$null;cod='0502147'}
$ppMap['PP MAYONESA DE ZANAHORIA GRS']       = @{id='7b9fe704-0364-4b7f-93cf-957d2324edc3';tipo='DIRECTO';gpp=$null;cod='0502225'}
$ppMap['PP MECHADA 150G']                    = @{id='06731dcb-50d4-48d0-9728-7681d24693f8';tipo='PORCION';gpp=0.75;cod='0502031'}
$ppMap['PP MIX TABLA CRIOLLA GR']            = @{id='da6994ea-9821-4406-98b8-9a986eb1d4cd';tipo='PORCION';gpp=400;cod=$null}
$ppMap['PP PANCETAS 13 GRS C/U UND']         = @{id='dd2aa891-7b53-412b-9f9b-b0f2d111249f';tipo='UND';gpp=1;cod='0502037'}
$ppMap['PP PANQUEQUES UND']                  = @{id='25a30f6d-0d6c-4479-8ce8-f7a3feb1e78d';tipo='UND';gpp=1;cod='0502022'}
$ppMap['PP PAPAS TABLA GR']                  = @{id='599ee355-96d6-42d9-b56a-0c787cf30bd6';tipo='PORCION';gpp=0.35;cod='0401010'}
$ppMap['PP PLATEADAS UND']                   = @{id='3f6c230f-cb3f-4e33-9d94-adeca3737603';tipo='DIRECTO';gpp=1;cod='0502031'}
$ppMap['PP PURE DE MANZANA GRS']             = @{id='6364199a-c96c-4e1f-bfa4-70336a3f159f';tipo='DIRECTO';gpp=$null;cod='0502011'}
$ppMap['PP PURE DE PAPAS GRS']               = @{id='df453a35-7b53-4ff9-b961-6aef9deb9543';tipo='PORCION';gpp=300;cod='0502017'}
$ppMap['PP QUESO TABLA (UND)']               = @{id='c008884c-d0ff-4959-8fa9-201814111c62';tipo='PORCION';gpp=150;cod='0201004'}
$ppMap['PP QUINOA GRS']                      = @{id='7fb71b8a-130e-4449-b959-0a3e598cb1a4';tipo='PORCION';gpp=150;cod='0502121'}
$ppMap['PP SALMON TROZO GR']                 = @{id='3610f384-8632-4b0f-98ac-1ce64b7050c5';tipo='PORCION';gpp=0.25;cod='0303021'}
$ppMap['PP SALSA ACIDA CC']                  = @{id='e58471e6-053b-4cb8-b4d4-d8bb7a0b0328';tipo='DIRECTO';gpp=$null;cod='0502173'}
$ppMap['PP SALSA CESAR GRS']                 = @{id='a5cbf64a-3524-4231-871e-a48109bb6fa1';tipo='DIRECTO';gpp=$null;cod='0502003'}
$ppMap['PP SALSA DE CRUDO GRS']              = @{id='614be1ed-5913-408f-bae0-e9dbf8f79573';tipo='DIRECTO';gpp=$null;cod='0502001'}
$ppMap['PP SALSA DE PALTA CC']               = @{id='4f12d0f5-2f22-48d8-a304-79b05a565838';tipo='DIRECTO';gpp=$null;cod='0502128'}
$ppMap['PP SALSA TOMACA GR']                 = @{id='bf8d52e7-5438-4478-bd2b-0fcde12a4369';tipo='DIRECTO';gpp=$null;cod='0502260'}
$ppMap['PP SMASH GR']                        = @{id='8c0ce25b-b455-41ff-a183-69e7b6f00d2c';tipo='DIRECTO';gpp=$null;cod='0502251'}
$ppMap['PP SOPAIPILLAS UND']                 = @{id='733bd10f-c423-4779-a5a9-893e88ca9478';tipo='UND';gpp=1;cod='0502055'}
$ppMap['PP SPATZLER GRS']                    = @{id='ae34dd1c-620c-467b-b20a-4153bcd22447';tipo='PORCION';gpp=190;cod='0502012'}
$ppMap['PP TRIGO MOTE (GRS)']               = @{id='a96281eb-37ce-4378-9280-0ac4e4cbdc60';tipo='PORCION';gpp=150;cod='0502125'}
$ppMap['PP VALDIVIANO (UND)']               = @{id='f2de2847-1d21-488b-b1ce-89303fe40c6c';tipo='UND';gpp=1;cod='0502202'}

# -- Productos con costo (para mermas) - solo costo y unidad_medida ------------
$prodMap = @{}
$prodMap['0101003'] = @{costo=360;um='UN'}
$prodMap['0301004'] = @{costo=9;um='GR'}
$prodMap['0301048'] = @{costo=1065;um='UN'}
$prodMap['0303021'] = @{costo=10479;um='KG'}
$prodMap['0401005'] = @{costo=1389;um='UN'}
$prodMap['0401008'] = @{costo=3832;um='KG'}
$prodMap['0401009'] = @{costo=4950;um='KG'}
$prodMap['0401010'] = @{costo=410;um='KG'}
$prodMap['0401011'] = @{costo=1426;um='KG'}
$prodMap['0401015'] = @{costo=10990;um='KG'}
$prodMap['0401079'] = @{costo=2200;um='KG'}
$prodMap['0502037'] = @{costo=8;um='UN'}
$prodMap['0502125'] = @{costo=1;um='GR'}
$prodMap['0902005'] = @{costo=1775;um='KG'}
$prodMap['1001002'] = @{costo=258;um='UN'}
$prodMap['1001003'] = @{costo=237;um='UN'}
$prodMap['1001004'] = @{costo=134;um='UN'}
$prodMap['1001013'] = @{costo=291;um='UN'}

# -- Abrir Excel ---------------------------------------------------------------
Write-Host "Abriendo Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$workbook = $excel.Workbooks.Open($excelPath)
$fecha25 = [DateTime]::new(2026, 5, 25).ToOADate()

# -- Leer PRODUCCION -----------------------------------------------------------
$shP = $workbook.Sheets.Item("PRODUCCION")
$datP = $shP.UsedRange.Value2
$prodRecords = [System.Collections.Generic.List[hashtable]]::new()
$prodIdMap   = @{}  # excelId -> newUUID

for ($r = 2; $r -le $datP.GetUpperBound(0); $r++) {
    $fecha = $datP[$r, 2]
    if (-not ($fecha -is [double]) -or $fecha -lt $fecha25) { continue }
    $excelId = "$($datP[$r, 1])"
    $respRaw = "$($datP[$r, 3])".Trim()
    $turno   = "$($datP[$r, 4])".Trim().ToUpper()
    $obs     = "$($datP[$r, 5])".Trim()
    if (-not $obs) { $obs = "Produccion importada $([DateTime]::FromOADate($fecha).ToString('dd/MM/yy'))" }
    $respKey = $respRaw.ToUpper()
    $respId  = $respMap[$respKey]
    if (-not $respId) {
        Write-Warning "Responsable no mapeado: '$respRaw' - usando admin"
        $respId = '697ff4c1-c928-4a05-abcd-aa4528273cc1'
    }
    $newId = [Guid]::NewGuid().ToString()
    $prodIdMap[$excelId] = $newId
    $prodRecords.Add(@{
        newId      = $newId
        fecha      = [DateTime]::FromOADate($fecha).ToString("yyyy-MM-dd")
        respId     = $respId
        respNombre = $respRaw
        turno      = $turno
        obs        = $obs
    })
}
Write-Host "Produccion: $($prodRecords.Count) registros"

# -- Leer DETALLE (cols: 1=ID, 2=IDPROD, 3=FECHA, 4=PP, 5=RECETAS, 6=CANT, 7=MERMA, 8=TOTAL) --
$shD = $workbook.Sheets.Item("DETALLE")
$datD = $shD.UsedRange.Value2
$detRecords = [System.Collections.Generic.List[hashtable]]::new()
$ppNoMatch  = @{}

for ($r = 2; $r -le $datD.GetUpperBound(0); $r++) {
    $idprod = "$($datD[$r, 2])".Trim()
    if (-not $idprod -or -not $prodIdMap.ContainsKey($idprod)) { continue }
    $ppRaw  = "$($datD[$r, 4])".Trim()
    if (-not $ppRaw) { continue }
    $ppKey  = NormPP($ppRaw)
    $cant   = $datD[$r, 6]
    $total  = $datD[$r, 8]
    if ($null -eq $cant) { continue }
    $pp = $ppMap[$ppKey]
    if (-not $pp) {
        if (-not $ppNoMatch.ContainsKey($ppKey)) { $ppNoMatch[$ppKey] = 0 }
        $ppNoMatch[$ppKey]++
        $pp = @{id=$null;tipo='DIRECTO';gpp=$null;cod=$null}
    }
    if ($null -eq $total -or [double]$total -eq 0) {
        if ($pp.tipo -eq 'CC' -or $pp.tipo -eq 'DIRECTO') { $total = $cant }
        elseif ($pp.gpp) { $total = [Math]::Round([double]$cant * [double]$pp.gpp, 3) }
        else { $total = $cant }
    }
    $detRecords.Add(@{
        prodNewId = $prodIdMap[$idprod]
        ppId      = $pp.id
        ppNombre  = $ppRaw
        tipoPP    = $pp.tipo
        gpp       = $pp.gpp
        cod       = $pp.cod
        cantidad  = [double]$cant
        total     = [double]$total
    })
}
Write-Host "Detalle produccion: $($detRecords.Count) lineas"

# -- Leer MERMAS ---------------------------------------------------------------
$shM = $workbook.Sheets.Item("MERMAS")
$datM = $shM.UsedRange.Value2
$merRecords = [System.Collections.Generic.List[hashtable]]::new()
$merIdMap   = @{}

for ($r = 2; $r -le $datM.GetUpperBound(0); $r++) {
    $fecha = $datM[$r, 2]
    if (-not ($fecha -is [double]) -or $fecha -lt $fecha25) { continue }
    $excelId = "$($datM[$r, 1])".Trim()
    $respRaw = "$($datM[$r, 3])".Trim()
    $obs     = "$($datM[$r, 4])".Trim()
    if (-not $obs) { $obs = "Merma $([DateTime]::FromOADate($fecha).ToString('dd/MM/yy')) - $respRaw" }
    $respKey = $respRaw.ToUpper()
    $respId  = $respMap[$respKey]
    if (-not $respId) {
        Write-Warning "Responsable merma no mapeado: '$respRaw' - usando admin"
        $respId = '697ff4c1-c928-4a05-abcd-aa4528273cc1'
    }
    $newId = [Guid]::NewGuid().ToString()
    $merIdMap[$excelId] = $newId
    $merRecords.Add(@{
        newId      = $newId
        fecha      = [DateTime]::FromOADate($fecha).ToString("yyyy-MM-dd")
        respId     = $respId
        respNombre = $respRaw
        obs        = $obs
    })
}
Write-Host "Mermas: $($merRecords.Count) registros"

# -- Leer Detalle_Mermas -------------------------------------------------------
$shDM = $workbook.Sheets.Item("Detalle_Mermas")
$datDM = $shDM.UsedRange.Value2
$merDetRecords = [System.Collections.Generic.List[hashtable]]::new()
$prodSinCosto  = @{}

for ($r = 2; $r -le $datDM.GetUpperBound(0); $r++) {
    $idmer = "$($datDM[$r, 2])".Trim()
    if (-not $idmer -or -not $merIdMap.ContainsKey($idmer)) { continue }
    $codigo = "$($datDM[$r, 3])".Trim()
    $cant   = $datDM[$r, 4]
    $nombre = "$($datDM[$r, 5])".Trim()
    if (-not $codigo -or $null -eq $cant) { continue }
    $prod = $prodMap[$codigo]
    $cu = 0; $ct = 0; $um = $null
    if ($prod) {
        $cu = $prod.costo
        $um = $prod.um
        $ct = [Math]::Round([double]$cant * [double]$cu)
    } else {
        if (-not $prodSinCosto.ContainsKey($codigo)) { $prodSinCosto[$codigo] = $nombre }
    }
    $merDetRecords.Add(@{
        merNewId = $merIdMap[$idmer]
        codigo   = $codigo
        nombre   = $nombre
        cantidad = [double]$cant
        um       = $um
        cu       = $cu
        ct       = $ct
    })
}
Write-Host "Detalle mermas: $($merDetRecords.Count) lineas"

$workbook.Close($false); $excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

# -- Construir SQL -------------------------------------------------------------
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("-- ============================================================")
$lines.Add("-- MIGRACION: Produccion + Mermas 25-05 al 01-06-2026")
$lines.Add("-- Generado: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("-- Produccion: $($prodRecords.Count) registros | $($detRecords.Count) lineas detalle")
$lines.Add("-- Mermas:     $($merRecords.Count) registros | $($merDetRecords.Count) lineas detalle")
$lines.Add("-- NOTA: costo_unitario/costo_total de produccion = 0")
$lines.Add("--       Ejecutar POST /api/maestros/recalcular-costos-produccion despues")
$lines.Add("-- ============================================================")
$lines.Add("BEGIN;")
$lines.Add("")

# INSERT produccion
$lines.Add("-- ----------------------------------------------------------------")
$lines.Add("-- PRODUCCION ($($prodRecords.Count) registros)")
$lines.Add("-- ----------------------------------------------------------------")
foreach ($p in $prodRecords) {
    $lines.Add("INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)")
    $lines.Add("  VALUES ($(SqlStr $p.newId), $(SqlStr $p.fecha), $(SqlStr $p.respId), $(SqlStr $p.respNombre), $(SqlStr $p.turno), $(SqlStr $p.obs), 'REGISTRADO');")
}
$lines.Add("")

# INSERT detalle_produccion
$lines.Add("-- --------------------------------------------------------------")
$lines.Add("-- DETALLE PRODUCCION ($($detRecords.Count) lineas)")
$lines.Add("-- --------------------------------------------------------------")
foreach ($d in $detRecords) {
    $ppIdSql = if ($d.ppId)  { SqlStr $d.ppId  } else { 'NULL' }
    $codSql  = if ($d.cod)   { SqlStr $d.cod   } else { 'NULL' }
    $gppSql  = if ($null -ne $d.gpp) { SqlNum $d.gpp } else { 'NULL' }
    $tipoSql = if ($d.tipoPP){ SqlStr $d.tipoPP} else { 'NULL' }
    $lines.Add("INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)")
    $lines.Add("  VALUES ($(SqlStr $d.prodNewId), $ppIdSql, $(SqlStr $d.ppNombre), $tipoSql, $(SqlNum $d.cantidad), $gppSql, $(SqlNum $d.total), $codSql, 0, 0);")
}
$lines.Add("")

# INSERT mermas
$lines.Add("-- --------------------------------------------------------------")
$lines.Add("-- MERMAS ($($merRecords.Count) registros)")
$lines.Add("-- --------------------------------------------------------------")
foreach ($m in $merRecords) {
    $lines.Add("INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)")
    $lines.Add("  VALUES ($(SqlStr $m.newId), $(SqlStr $m.fecha), $(SqlStr $m.respId), $(SqlStr $m.respNombre), $(SqlStr $m.obs), 'REGISTRADO');")
}
$lines.Add("")

# INSERT detalle_mermas
$lines.Add("-- --------------------------------------------------------------")
$lines.Add("-- DETALLE MERMAS ($($merDetRecords.Count) lineas)")
$lines.Add("-- --------------------------------------------------------------")
foreach ($d in $merDetRecords) {
    $umSql = if ($d.um) { SqlStr $d.um } else { 'NULL' }
    $lines.Add("INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)")
    $lines.Add("  VALUES ($(SqlStr $d.merNewId), $(SqlStr $d.codigo), $(SqlStr $d.nombre), $(SqlNum $d.cantidad), $umSql, NULL, $(SqlNum $d.cu), $(SqlNum $d.ct));")
}
$lines.Add("")
$lines.Add("COMMIT;")

# Advertencias
if ($ppNoMatch.Count -gt 0) {
    Write-Host ""
    Write-Host "ADVERTENCIA - PP sin match ($($ppNoMatch.Count) nombres):" -ForegroundColor Yellow
    foreach ($k in $ppNoMatch.Keys | Sort-Object) {
        Write-Host ("  [{0}x] '{1}'" -f $ppNoMatch[$k], $k) -ForegroundColor Yellow
    }
}
if ($prodSinCosto.Count -gt 0) {
    Write-Host ""
    Write-Host "ADVERTENCIA - Productos de merma sin costo ($($prodSinCosto.Count)):" -ForegroundColor Yellow
    foreach ($k in $prodSinCosto.Keys | Sort-Object) {
        Write-Host ("  $k = $($prodSinCosto[$k])") -ForegroundColor Yellow
    }
}

# Escribir UTF-8 con BOM para que SQL Editor lo lea bien
[System.IO.File]::WriteAllLines($outputPath, $lines, (New-Object System.Text.UTF8Encoding($true)))
Write-Host ""
Write-Host "SQL generado: $outputPath" -ForegroundColor Green
Write-Host ("  Total INSERT: {0} registros" -f ($prodRecords.Count + $detRecords.Count + $merRecords.Count + $merDetRecords.Count))
