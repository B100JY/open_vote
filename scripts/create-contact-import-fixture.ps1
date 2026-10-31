param([Parameter(Mandatory = $true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
# 실제 개인정보가 없는 업로드 E2E용 최소 OpenXML 파일. 기존 파일을 덮어쓰지 않는다.
if (Test-Path -LiteralPath $OutputPath) { throw 'Fixture already exists' }
$entries = @{
 '[Content_Types].xml' = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
 '_rels/.rels' = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
 'xl/workbook.xml' = '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="명부" sheetId="1" r:id="rId1"/><sheet name="헤더없음" sheetId="2" r:id="rId2"/></sheets></workbook>'
 'xl/_rels/workbook.xml.rels' = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'
 'xl/worksheets/sheet1.xml' = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>메모</t></is></c><c r="B1" t="inlineStr"><is><t>이름</t></is></c><c r="C1" t="inlineStr"><is><t>그룹(선택사항)</t></is></c><c r="D1" t="inlineStr"><is><t>전화번호</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>이 열은 저장하지 않음</t></is></c><c r="B2" t="inlineStr"><is><t>엑셀검증-가</t></is></c><c r="C2" t="inlineStr"><is><t>엑셀검증-A;엑셀검증-B</t></is></c><c r="D2"><v>1000000001</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>엑셀검증-나</t></is></c><c r="C3" t="inlineStr"><is><t>엑셀검증-B</t></is></c><c r="D3" t="inlineStr"><is><t>01000000002</t></is></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>엑셀검증-가</t></is></c><c r="C4" t="inlineStr"><is><t>엑셀검증-C</t></is></c><c r="D4" t="inlineStr"><is><t>01000000001</t></is></c></row></sheetData></worksheet>'
 'xl/worksheets/sheet2.xml' = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>01000000003</t></is></c><c r="B1" t="inlineStr"><is><t>엑셀검증-다</t></is></c></row></sheetData></worksheet>'
}
$stream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($pair in $entries.GetEnumerator()) {
  $entry = $zip.CreateEntry($pair.Key)
  $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
  try { $writer.Write($pair.Value) } finally { $writer.Dispose() }
 }
} finally { $zip.Dispose(); $stream.Dispose() }
Write-Output $OutputPath
