-- ============================================================
-- MIGRACION: Produccion + Mermas 25-05 al 01-06-2026
-- Generado: 2026-06-02 14:46:34
-- Produccion: 19 registros | 82 lineas detalle
-- Mermas:     15 registros | 60 lineas detalle
-- NOTA: costo_unitario/costo_total de produccion = 0
--       Ejecutar POST /api/maestros/recalcular-costos-produccion despues
-- ============================================================
BEGIN;

-- ----------------------------------------------------------------
-- PRODUCCION (19 registros)
-- ----------------------------------------------------------------
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('b46556a0-c9e1-49c7-a71a-b022866907c3', '2026-05-25', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'PM', 'Produccion 25/05', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '2026-05-25', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am 25.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('b51733d7-a0e8-49d5-996b-d963314412ae', '2026-05-26', 'd3628a73-094e-4013-972d-330916e16c51', 'LUISA FLANDEZ', 'AM', 'Produccion 26/05/26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('ae46833d-8d9d-4891-8202-c47ca023ff8a', '2026-05-26', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am 26.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('640b5197-c4ab-42e5-8a0d-fad06260981c', '2026-05-26', 'ee204df1-17cb-491b-bb46-f611da02cdb0', 'FELIPE VIDAL', 'PM', '26/05', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('dfae3d48-8565-4b03-8418-be2bbaa272de', '2026-05-26', 'ee204df1-17cb-491b-bb46-f611da02cdb0', 'FELIPE VIDAL', 'PM', 'Producción pm 26.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', '2026-05-27', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am 27.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('6d3cd85b-f765-4f63-86e4-c60ace869ee5', '2026-05-27', 'd3628a73-094e-4013-972d-330916e16c51', 'LUISA FLANDEZ', 'AM', 'Produccion 27/05/26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('3b761e69-d90e-4b09-a478-d5116e9aac6b', '2026-05-27', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'PM', 'Produccion pm 27/05', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('9011592f-e1a2-42d7-b92a-ecb168de4da4', '2026-05-28', 'd3628a73-094e-4013-972d-330916e16c51', 'LUISA FLANDEZ', 'AM', 'Produccion 28/05/26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('16a61714-2bb2-4c01-bb7a-be448a9b9801', '2026-05-28', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('6b26b15c-7689-447e-82f7-3a66d56eba57', '2026-05-28', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am 28.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('5917ba31-6b29-4630-857d-d54789d877f8', '2026-05-28', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'PM', 'Produccion 28.05 pm', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '2026-05-29', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am 29.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('d9e5a154-7d92-4293-86cd-dd14886fbc79', '2026-05-29', 'd3628a73-094e-4013-972d-330916e16c51', 'LUISA FLANDEZ', 'AM', 'Produccion29/05/26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('56f51e08-f0db-4f8d-8175-676d59f2445b', '2026-05-30', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'AM', 'Producción am 30.05.26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', '2026-05-31', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'AM', 'Producción 31/05', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('339d34fa-422c-4120-afbf-53adc7fd7c6f', '2026-05-29', 'd3628a73-094e-4013-972d-330916e16c51', 'LUISA FLANDEZ', 'AM', 'Produccion del 29/05/26', 'REGISTRADO');
INSERT INTO produccion (id, fecha, responsable_id, responsable_nombre, turno, observacion, estado)
  VALUES ('56d0817e-ecf9-4508-a86f-57b1e04e6767', '2026-06-01', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'PM', 'Producción 01.06.26', 'REGISTRADO');

-- --------------------------------------------------------------
-- DETALLE PRODUCCION (82 lineas)
-- --------------------------------------------------------------
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b46556a0-c9e1-49c7-a71a-b022866907c3', 'f716067e-548d-46b0-b27c-5c1d85bcc857', 'PP FILETE DE POLLO', 'PORCION', 52, 200, 10400, '0302001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b46556a0-c9e1-49c7-a71a-b022866907c3', '3080dc0e-4d77-414b-acf6-158d0c593635', 'PP CHAMPIÑON RELLENO (UND)', 'UND', 72, 1, 72, '0502039', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b46556a0-c9e1-49c7-a71a-b022866907c3', 'a96281eb-37ce-4378-9280-0ac4e4cbdc60', 'PP TRIGO MOTE (GRS)', 'PORCION', 13, 150, 1950, '0502125', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b46556a0-c9e1-49c7-a71a-b022866907c3', 'e0ec08ce-f4c8-4217-a645-8f030fe51bb4', 'PP BECHAMEL DE QUESO MANTECOSO GRS', 'PORCION', 11, 100, 1100, '0502073', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '599ee355-96d6-42d9-b56a-0c787cf30bd6', 'PP PAPAS TABLA GR', 'PORCION', 21, 0.35, 6300, '0401010', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '81f53f0d-77a8-4157-8182-2da401c3cd06', 'PP JUGO DE FRAMBUESA CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '614be1ed-5913-408f-bae0-e9dbf8f79573', 'PP SALSA DE CRUDO GRS', 'DIRECTO', 11000, NULL, 11000, '0502001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '8c0ce25b-b455-41ff-a183-69e7b6f00d2c', 'PP SMASH GR', 'DIRECTO', 4000, NULL, 4000, '0502251', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', 'dd2aa891-7b53-412b-9f9b-b0f2d111249f', 'PP PANCETAS 13 GRS C/U UND', 'UND', 5930, 1, 5930, '0502037', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', 'df453a35-7b53-4ff9-b961-6aef9deb9543', 'PP PURE DE PAPAS GRS', 'PORCION', 50, 300, 15000, '0502017', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '7fb71b8a-130e-4449-b959-0a3e598cb1a4', 'PP QUINOA GRS', 'PORCION', 58, 150, 8700, '0502121', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '0b909229-993a-4982-9c3a-028e1392966a', 'PP JUGO DE MANGO (CC) CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('75173649-9805-41a3-82c9-315e9d2deb3a', '4bb08b4e-51c9-4716-a5b6-65de2955f8cf', 'PP BROCHETAS (UND)', 'UND', 15, 1, 60, '0502263', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b51733d7-a0e8-49d5-996b-d963314412ae', 'b2f2b6e7-eea7-4f61-a2aa-ad777e72cc31', 'PP CIERVO PORC', 'PORCION', 104, 1, 104, '0502027', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b51733d7-a0e8-49d5-996b-d963314412ae', '06731dcb-50d4-48d0-9728-7681d24693f8', 'PP MECHADA 150g', 'PORCION', 63, 0.75, 47, '0502031', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('b51733d7-a0e8-49d5-996b-d963314412ae', '3f6c230f-cb3f-4e33-9d94-adeca3737603', 'PP PLATEADAS UND', 'DIRECTO', 115, 1, 115, '0502031', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ae46833d-8d9d-4891-8202-c47ca023ff8a', 'f2de2847-1d21-488b-b1ce-89303fe40c6c', 'PP VALDIVIANO (UND)', 'UND', 41, 1, 41, '0502202', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ae46833d-8d9d-4891-8202-c47ca023ff8a', 'b0e2a8ba-a008-4d9d-b001-b807633353b6', 'PP CEBOLLA CARAMELIZADA GRS', 'DIRECTO', 11000, NULL, 11000, '0502013', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ae46833d-8d9d-4891-8202-c47ca023ff8a', 'c008884c-d0ff-4959-8fa9-201814111c62', 'PP QUESO TABLA (UND)', 'PORCION', 17, 150, 2550, '0201004', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('640b5197-c4ab-42e5-8a0d-fad06260981c', '25a30f6d-0d6c-4479-8ce8-f7a3feb1e78d', 'PP PANQUEQUES UND', 'UND', 35, 1, 35, '0502022', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('640b5197-c4ab-42e5-8a0d-fad06260981c', 'da6994ea-9821-4406-98b8-9a986eb1d4cd', 'PP MIX TABLA  CRIOLLA GR', 'PORCION', 13, 400, 5200, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('dfae3d48-8565-4b03-8418-be2bbaa272de', 'dd2aa891-7b53-412b-9f9b-b0f2d111249f', 'PP PANCETAS 13 GRS C/U UND', 'UND', 3200, 1, 3200, '0502037', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', '3080dc0e-4d77-414b-acf6-158d0c593635', 'PP CHAMPIÑON RELLENO (UND)', 'UND', 50, 1, 50, '0502039', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', '614be1ed-5913-408f-bae0-e9dbf8f79573', 'PP SALSA DE CRUDO GRS', 'DIRECTO', 10640, NULL, 10640, '0502001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', '6364199a-c96c-4e1f-bfa4-70336a3f159f', 'PP PURE DE MANZANA GRS', 'DIRECTO', 7000, NULL, 7000, '0502011', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', '98e65ec5-e68f-4bb4-9c00-2d209e20fed8', 'PP ARROZ BLANCO GRS', 'PORCION', 6, 200, 1200, '0502015', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', 'b0e2a8ba-a008-4d9d-b001-b807633353b6', 'PP CEBOLLA CARAMELIZADA GRS', 'DIRECTO', 10000, NULL, 10000, '0502013', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('40c74062-9465-485d-b827-b4c601592bea', 'ae34dd1c-620c-467b-b20a-4153bcd22447', 'PP SPATZLER GRS', 'PORCION', 74, 190, 14060, '0502012', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('6d3cd85b-f765-4f63-86e4-c60ace869ee5', '16a1c926-6eba-462b-bf2e-6c9ffe016585', 'PP BABY RIBS UND', 'UND', 200, 1, 200, '0502023', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('3b761e69-d90e-4b09-a478-d5116e9aac6b', '8c1f90ad-f656-4515-b902-5519a1dbb71d', 'PP HAMBURGUESA DE GARBANZO UND', 'UND', 39, 1, 39, '0502038', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('3b761e69-d90e-4b09-a478-d5116e9aac6b', 'dd2aa891-7b53-412b-9f9b-b0f2d111249f', 'PP PANCETAS 13 GRS C/U UND', 'UND', 1980, 1, 1980, '0502037', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('3b761e69-d90e-4b09-a478-d5116e9aac6b', 'bf8d52e7-5438-4478-bd2b-0fcde12a4369', 'PP SALSA TOMACA GR', 'DIRECTO', 420, NULL, 420, '0502260', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('9011592f-e1a2-42d7-b92a-ecb168de4da4', '16a1c926-6eba-462b-bf2e-6c9ffe016585', 'PP BABY RIBS UND', 'UND', 20, 1, 20, '0502023', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('16a61714-2bb2-4c01-bb7a-be448a9b9801', '599ee355-96d6-42d9-b56a-0c787cf30bd6', 'PP PAPAS TABLA GR', 'PORCION', 15, 0.35, 4500, '0401010', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('16a61714-2bb2-4c01-bb7a-be448a9b9801', '4bb08b4e-51c9-4716-a5b6-65de2955f8cf', 'PP BROCHETAS (UND)', 'UND', 10, 1, 40, '0502263', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('16a61714-2bb2-4c01-bb7a-be448a9b9801', '481a74d8-f1a3-44e2-a4b7-018adf2e783a', 'PP ENTRAÑA PR', 'PORCION', 14, 400, 5600, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('6b26b15c-7689-447e-82f7-3a66d56eba57', '7b9fe704-0364-4b7f-93cf-957d2324edc3', 'PP MAYONESA DE ZANAHORIA GRS', 'DIRECTO', 345, NULL, 345, '0502225', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('6b26b15c-7689-447e-82f7-3a66d56eba57', '4f12d0f5-2f22-48d8-a304-79b05a565838', 'PP SALSA DE PALTA CC', 'DIRECTO', 310, NULL, 310, '0502128', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('6b26b15c-7689-447e-82f7-3a66d56eba57', 'e58471e6-053b-4cb8-b4d4-d8bb7a0b0328', 'PP SALSA ACIDA CC', 'DIRECTO', 2200, NULL, 2200, '0502173', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('6b26b15c-7689-447e-82f7-3a66d56eba57', '614be1ed-5913-408f-bae0-e9dbf8f79573', 'PP SALSA DE CRUDO GRS', 'DIRECTO', 10785, NULL, 10785, '0502001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('5917ba31-6b29-4630-857d-d54789d877f8', '0b909229-993a-4982-9c3a-028e1392966a', 'PP JUGO DE MANGO (CC) CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('5917ba31-6b29-4630-857d-d54789d877f8', '81f53f0d-77a8-4157-8182-2da401c3cd06', 'PP JUGO DE FRAMBUESA CC', 'DIRECTO', 15000, NULL, 15000, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('5917ba31-6b29-4630-857d-d54789d877f8', '393f747d-c4a3-4c28-8b6d-57311b34d5ef', 'PP JUGO DE PIÑA (CC) CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '0b909229-993a-4982-9c3a-028e1392966a', 'PP JUGO DE MANGO (CC) CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '393f747d-c4a3-4c28-8b6d-57311b34d5ef', 'PP JUGO DE PIÑA (CC) CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '8c0ce25b-b455-41ff-a183-69e7b6f00d2c', 'PP SMASH GR', 'DIRECTO', 4600, NULL, 4600, '0502251', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '81f53f0d-77a8-4157-8182-2da401c3cd06', 'PP JUGO DE FRAMBUESA CC', 'DIRECTO', 7500, NULL, 7500, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '599ee355-96d6-42d9-b56a-0c787cf30bd6', 'PP PAPAS TABLA GR', 'PORCION', 32, 0.35, 9600, '0401010', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '481a74d8-f1a3-44e2-a4b7-018adf2e783a', 'PP ENTRAÑA PR', 'PORCION', 18, 400, 7200, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '8eb3db8c-0344-49f8-9a63-0b8535747f79', 'PP CARNE TABLA (UND)', 'PORCION', 11, 0.2, 2200, '0301044', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '614be1ed-5913-408f-bae0-e9dbf8f79573', 'PP SALSA DE CRUDO GRS', 'DIRECTO', 10600, NULL, 10600, '0502001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '46224f99-961f-4e05-8054-ff33ae9742a1', 'PP MAYO AJO CABRA (STRONG) GRS', 'DIRECTO', 3000, NULL, 3000, '0502234', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', 'e58471e6-053b-4cb8-b4d4-d8bb7a0b0328', 'PP SALSA ACIDA CC', 'DIRECTO', 2200, NULL, 2200, '0502173', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', 'f716067e-548d-46b0-b27c-5c1d85bcc857', 'PP FILETE DE POLLO', 'PORCION', 65, 200, 13000, '0302001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '0f044da1-b1f4-46dc-a04d-c4dbde8b0592', 'PP MAYONESA CASERA GRS', 'DIRECTO', 12600, NULL, 12600, '0502147', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', 'a5cbf64a-3524-4231-871e-a48109bb6fa1', 'PP SALSA CESAR GRS', 'DIRECTO', 2300, NULL, 2300, '0502003', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '3610f384-8632-4b0f-98ac-1ce64b7050c5', 'PP SALMON TROZO GR', 'PORCION', 31, 0.25, 7750, '0303021', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('ee364d3c-0e27-4a9a-b5c9-d585c4d59764', '3080dc0e-4d77-414b-acf6-158d0c593635', 'PP CHAMPIÑON RELLENO (UND)', 'UND', 100, 1, 100, '0502039', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('d9e5a154-7d92-4293-86cd-dd14886fbc79', 'ad90f6c1-d2f2-4b23-9aee-89a1517da7e8', 'PP GOULASH', 'PORCION', 120, 250, 30000, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56f51e08-f0db-4f8d-8175-676d59f2445b', '4bb08b4e-51c9-4716-a5b6-65de2955f8cf', 'PP BROCHETAS (UND)', 'UND', 12, 1, 48, '0502263', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56f51e08-f0db-4f8d-8175-676d59f2445b', 'a96281eb-37ce-4378-9280-0ac4e4cbdc60', 'PP TRIGO MOTE (GRS)', 'PORCION', 18, 150, 2700, '0502125', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56f51e08-f0db-4f8d-8175-676d59f2445b', '614be1ed-5913-408f-bae0-e9dbf8f79573', 'PP SALSA DE CRUDO GRS', 'DIRECTO', 11500, NULL, 11500, '0502001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56f51e08-f0db-4f8d-8175-676d59f2445b', '0f044da1-b1f4-46dc-a04d-c4dbde8b0592', 'PP MAYONESA CASERA GRS', 'DIRECTO', 6550, NULL, 6550, '0502147', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', 'da6994ea-9821-4406-98b8-9a986eb1d4cd', 'PP MIX TABLA  CRIOLLA GR', 'PORCION', 13, 400, 5200, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', '0b909229-993a-4982-9c3a-028e1392966a', 'PP JUGO DE MANGO (CC) CC', 'DIRECTO', 15000, NULL, 15000, '0502175', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', '614be1ed-5913-408f-bae0-e9dbf8f79573', 'PP SALSA DE CRUDO GRS', 'DIRECTO', 11050, NULL, 11050, '0502001', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', 'bf8d52e7-5438-4478-bd2b-0fcde12a4369', 'PP SALSA TOMACA GR', 'DIRECTO', 300, NULL, 300, '0502260', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', 'ace523ad-12a9-41bf-b3d0-bd89ef85ac9e', 'PP LIMONETA DE CERVEZA CC', 'DIRECTO', 1600, NULL, 1600, '0502010', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', 'e58471e6-053b-4cb8-b4d4-d8bb7a0b0328', 'PP SALSA ACIDA CC', 'DIRECTO', 2.8, NULL, 3, '0502173', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', 'dd2aa891-7b53-412b-9f9b-b0f2d111249f', 'PP PANCETAS 13 GRS C/U UND', 'UND', 1700, 1, 1700, '0502037', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', '25a30f6d-0d6c-4479-8ce8-f7a3feb1e78d', 'PP PANQUEQUES UND', 'UND', 29, 1, 29, '0502022', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', '8eb3db8c-0344-49f8-9a63-0b8535747f79', 'PP CARNE TABLA (UND)', 'PORCION', 15, 0.2, 3000, '0301044', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('50372a6c-d586-4f1c-96a3-6aa366cb140c', 'c008884c-d0ff-4959-8fa9-201814111c62', 'PP QUESO TABLA (UND)', 'PORCION', 51, 150, 7650, '0201004', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('d9e5a154-7d92-4293-86cd-dd14886fbc79', '06731dcb-50d4-48d0-9728-7681d24693f8', 'PP MECHADA 150g', 'PORCION', 34, 0.75, 26, '0502031', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('d9e5a154-7d92-4293-86cd-dd14886fbc79', '3f6c230f-cb3f-4e33-9d94-adeca3737603', 'PP PLATEADAS UND', 'DIRECTO', 80, 1, 80, '0502031', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('d9e5a154-7d92-4293-86cd-dd14886fbc79', 'ad90f6c1-d2f2-4b23-9aee-89a1517da7e8', 'PP GOULASH', 'PORCION', 79, 250, 19750, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('d9e5a154-7d92-4293-86cd-dd14886fbc79', 'ad90f6c1-d2f2-4b23-9aee-89a1517da7e8', 'PP GOULASH', 'PORCION', 13, 250, 3250, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('339d34fa-422c-4120-afbf-53adc7fd7c6f', '80ec5a5b-4830-4a1c-89cd-b6e7a8b48169', 'PP CIERVO SIN PEPINILLOS', 'UND', 252, 1, 252, NULL, 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56d0817e-ecf9-4508-a86f-57b1e04e6767', 'df453a35-7b53-4ff9-b961-6aef9deb9543', 'PP PURE DE PAPAS GRS', 'PORCION', 22, 300, 6600, '0502017', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56d0817e-ecf9-4508-a86f-57b1e04e6767', '733bd10f-c423-4779-a5a9-893e88ca9478', 'PP SOPAIPILLAS UND', 'UND', 196, 1, 196, '0502055', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56d0817e-ecf9-4508-a86f-57b1e04e6767', '599ee355-96d6-42d9-b56a-0c787cf30bd6', 'PP PAPAS TABLA GR', 'PORCION', 13, 0.35, 3900, '0401010', 0, 0);
INSERT INTO detalle_produccion (produccion_id, pp_id, nombre_pp, tipo_pp, cantidad, gramos_por_pp, total_producido, codigo_producto, costo_unitario, costo_total)
  VALUES ('56d0817e-ecf9-4508-a86f-57b1e04e6767', '98e65ec5-e68f-4bb4-9c00-2d209e20fed8', 'PP ARROZ BLANCO GRS', 'PORCION', 8, 200, 1600, '0502015', 0, 0);

-- --------------------------------------------------------------
-- MERMAS (15 registros)
-- --------------------------------------------------------------
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('bb7243dc-32f6-499a-8775-fde6e91e19b4', '2026-05-25', 'e00fe30c-037c-4f9a-a6d3-c0e28a1eee2b', 'JOEL MENDEZ', 'Merma 25/05/26 - JOEL MENDEZ', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('229a273a-0354-4556-a488-7c102013a586', '2026-05-25', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'merma 25/05', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('f56875ee-1979-42d3-a446-5a7eea64fb90', '2026-05-25', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'Merma am 25.05.26', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '2026-05-27', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'Merma am 27.05.26', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('1a1ff88f-5568-41a1-98ea-9a9e38946a06', '2026-05-26', 'ee204df1-17cb-491b-bb46-f611da02cdb0', 'FELIPE VIDAL', '26.05', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '2026-05-27', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'merma 27.05 pm', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('bca68973-9224-4516-ad7f-8865466b3b10', '2026-05-27', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'Merma 2705 pm', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('64ec3ed3-6f96-4503-875d-e3bdfed75dc0', '2026-05-28', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'Merma am 28.05.26', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '2026-05-28', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'mermas 28.05', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('4b8b1d96-6867-4c9e-8548-1f848e1788be', '2026-05-29', 'e00fe30c-037c-4f9a-a6d3-c0e28a1eee2b', 'JOEL MENDEZ', 'Merma 29/05/26 - JOEL MENDEZ', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('f3bc8c5c-a6a6-4525-b127-cf984aad057c', '2026-05-29', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'Merma am 29.05.26', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('9bbe3717-e923-491c-9904-60aec34a7ae3', '2026-05-29', 'e00fe30c-037c-4f9a-a6d3-c0e28a1eee2b', 'JOEL MENDEZ', 'Merma 29/05/26 - JOEL MENDEZ', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '2026-05-30', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'Merma am 30.05.26', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('4d03b9e8-c869-41ec-a767-3a02dce673f8', '2026-05-31', '17e16177-97ff-4ced-ac58-c78481875d8d', 'PAULINA TRONCOSO', 'Mermas 31/05', 'REGISTRADO');
INSERT INTO mermas (id, fecha, responsable_id, responsable_nombre, observacion, estado)
  VALUES ('b18e2ecf-8271-4dcd-a784-b9f4f15bac5b', '2026-06-01', '209d4394-5456-404f-b810-f15c1e35ffc4', 'PAMELA COLIHUINCA', 'Merma 01/06/26 - PAMELA COLIHUINCA', 'REGISTRADO');

-- --------------------------------------------------------------
-- DETALLE MERMAS (60 lineas)
-- --------------------------------------------------------------
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('bb7243dc-32f6-499a-8775-fde6e91e19b4', '0401011', 'TOMATE (KG)', 1.2, 'KG', NULL, 1426, 1711);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('bb7243dc-32f6-499a-8775-fde6e91e19b4', '0401008', 'MORRÓN (KG).', 2.07, 'KG', NULL, 3832, 7932);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('bb7243dc-32f6-499a-8775-fde6e91e19b4', '0401079', 'PAPAS CAMOTE O RUSTICAS (KG)', 6.3, 'KG', NULL, 2200, 13860);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('229a273a-0354-4556-a488-7c102013a586', '0902005', 'PAPAS CONGELADAS (KG)', 2.5, 'KG', NULL, 1775, 4438);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('229a273a-0354-4556-a488-7c102013a586', '1001004', 'PAN HOTELERO  (UND)', 2, 'UN', NULL, 134, 268);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('229a273a-0354-4556-a488-7c102013a586', '1001002', 'PAN HAMBURGUESAS  (UND)', 1, 'UN', NULL, 258, 258);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('229a273a-0354-4556-a488-7c102013a586', '0101003', 'EMPANADAS DE QUESO (UND).', 3, 'UN', NULL, 360, 1080);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('f56875ee-1979-42d3-a446-5a7eea64fb90', '0303021', 'SALMON FILETE (KG)', 0.25, 'KG', NULL, 10479, 2620);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('f56875ee-1979-42d3-a446-5a7eea64fb90', '0101003', 'EMPANADAS DE QUESO (UND).', 4, 'UN', NULL, 360, 1440);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '0502037', 'PP. PANCETAS (UND)', 1, 'UN', NULL, 8, 8);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '1001003', 'PAN HOT DOG  (UND)', 1, 'UN', NULL, 237, 237);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '0401005', 'LECHUGA HIDROPONICAS  (UND).', 2, 'UN', NULL, 1389, 2778);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '0401009', 'PALTAS (KG)', 0.75, 'KG', NULL, 4950, 3712);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '1001013', 'PAN BRIOCHE BLANCO  (UND)', 8, 'UN', NULL, 291, 2328);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('1a1ff88f-5568-41a1-98ea-9a9e38946a06', '0301048', 'HAMBURGUESA ANGUS (UND).', 1, 'UN', NULL, 1065, 1065);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('1a1ff88f-5568-41a1-98ea-9a9e38946a06', '0902005', 'PAPAS CONGELADAS (KG)', 2, 'KG', NULL, 1775, 3550);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '0303021', 'SALMON FILETE (KG)', 0.25, 'KG', NULL, 10479, 2620);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '0502125', 'PP. TRIGO MOTE (GR) PP = 150GR', 1, 'GR', NULL, 1, 1);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('de1f710f-5aca-4a8f-a11a-4eff63fc7bc4', '0301004', 'CARNE DE CRUDO (TARTARO) (GR)', 2185, 'GR', NULL, 9, 19665);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '0101003', 'EMPANADAS DE QUESO (UND).', 3, 'UN', NULL, 360, 1080);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '1001004', 'PAN HOTELERO  (UND)', 2, 'UN', NULL, 134, 268);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '0502001', 'PP. SALSA CRUDO (CC)', 100, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '0502260', 'PP. SALSA TOMACA (GR)', 300, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('bca68973-9224-4516-ad7f-8865466b3b10', '0101003', 'EMPANADAS DE QUESO (UND).', 6, 'UN', NULL, 360, 2160);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('bca68973-9224-4516-ad7f-8865466b3b10', '0902005', 'PAPAS CONGELADAS (KG)', 2.5, 'KG', NULL, 1775, 4438);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '0301012', 'CARNE PLATEADA (KG)', 4.8, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '0101130', 'TOMATE ENTERO PELADO (GR)', 1900, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('5ed4b2e6-fad1-41fc-85ee-59b684361de7', '0301004', 'CARNE DE CRUDO (TARTARO) (GR)', 0.4, 'GR', NULL, 9, 4);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('64ec3ed3-6f96-4503-875d-e3bdfed75dc0', '0502055', 'PP. SOPAIPILLAS (UND)', 3, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('64ec3ed3-6f96-4503-875d-e3bdfed75dc0', '0902005', 'PAPAS CONGELADAS (KG)', 0.5, 'KG', NULL, 1775, 888);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('64ec3ed3-6f96-4503-875d-e3bdfed75dc0', '0301032', 'ENTRAÑA VACUNO (KG)', 1.4, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('64ec3ed3-6f96-4503-875d-e3bdfed75dc0', '0502128', 'PP. SALSA DE PALTA (CC)', 240, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('64ec3ed3-6f96-4503-875d-e3bdfed75dc0', '0101003', 'EMPANADAS DE QUESO (UND).', 2, 'UN', NULL, 360, 720);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0301002', 'CHURRASCO PORCIONADO  (UND)', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0902005', 'PAPAS CONGELADAS (KG)', 0.6, 'KG', NULL, 1775, 1065);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0502037', 'PP. PANCETAS (UND)', 8, 'UN', NULL, 8, 64);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0502015', 'PP. ARROZ BLANCO (GR) PP = 200GR', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0101003', 'EMPANADAS DE QUESO (UND).', 6, 'UN', NULL, 360, 2160);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0101013', 'HUEVOS  (UND)', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '1001002', 'PAN HAMBURGUESAS  (UND)', 1, 'UN', NULL, 258, 258);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('d45a78a6-f06b-4ee9-853f-fe29977766e9', '0304001', 'SALCHICHAS HOT DOG  (UND)', 2, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('4b8b1d96-6867-4c9e-8548-1f848e1788be', '0401006', 'LIMÓN (KG)', 0.32, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('4b8b1d96-6867-4c9e-8548-1f848e1788be', '0401011', 'TOMATE (KG)', 0.4, 'KG', NULL, 1426, 570);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('f3bc8c5c-a6a6-4525-b127-cf984aad057c', '0101003', 'EMPANADAS DE QUESO (UND).', 4, 'UN', NULL, 360, 1440);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('f3bc8c5c-a6a6-4525-b127-cf984aad057c', '0101013', 'HUEVOS  (UND)', 3, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('f3bc8c5c-a6a6-4525-b127-cf984aad057c', '0902005', 'PAPAS CONGELADAS (KG)', 0.5, 'KG', NULL, 1775, 888);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('9bbe3717-e923-491c-9904-60aec34a7ae3', '0401008', 'MORRÓN (KG).', 0.25, 'KG', NULL, 3832, 958);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '0502079', 'PP. TORTA SACHER (PORC)', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '0101013', 'HUEVOS  (UND)', 5, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '0502037', 'PP. PANCETAS (UND)', 8, 'UN', NULL, 8, 64);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '0502055', 'PP. SOPAIPILLAS (UND)', 6, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '0301048', 'HAMBURGUESA ANGUS (UND).', 1, 'UN', NULL, 1065, 1065);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '0101003', 'EMPANADAS DE QUESO (UND).', 2, 'UN', NULL, 360, 720);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('0da81f5e-91fd-4deb-b06f-7713b50115ca', '1001010', 'PAN PITA CHICO  (UND)', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('4d03b9e8-c869-41ec-a767-3a02dce673f8', '0502015', 'PP. ARROZ BLANCO (GR) PP = 200GR', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('4d03b9e8-c869-41ec-a767-3a02dce673f8', '0502077', 'PP. TORTA DE HOJA (PORC)', 1, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('4d03b9e8-c869-41ec-a767-3a02dce673f8', '0101013', 'HUEVOS  (UND)', 2, NULL, NULL, 0, 0);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('b18e2ecf-8271-4dcd-a784-b9f4f15bac5b', '1001004', 'PAN HOTELERO  (UND)', 2, 'UN', NULL, 134, 268);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('b18e2ecf-8271-4dcd-a784-b9f4f15bac5b', '0502125', 'PP. TRIGO MOTE (GR) PP = 150GR', 3, 'GR', NULL, 1, 3);
INSERT INTO detalle_mermas (merma_id, codigo_producto, nombre_producto, cantidad, unidad_medida, motivo, costo_unitario, costo_total)
  VALUES ('b18e2ecf-8271-4dcd-a784-b9f4f15bac5b', '0902005', 'PAPAS CONGELADAS (KG)', 5, 'KG', NULL, 1775, 8875);

COMMIT;
