-- rollback ל-quest_address_conversion.sql. מוחק את טבלת הגרסאות הקודמות — לאחריו אי אפשר לשחזר הדמיות שהומרו.
BEGIN;
DROP INDEX IF EXISTS idx_qac_status;
DROP INDEX IF EXISTS uq_qac_variant;
DROP INDEX IF EXISTS uq_qac_quest;
DROP TABLE IF EXISTS quest_address_conversion;
COMMIT;
