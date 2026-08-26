-- Existing installations may have created their IT department before incident
-- management introduced the explicit response-team flag. Recognize conventional
-- IT department names once; administrators can change the flag in Settings later.
UPDATE "departments"
SET "isIncidentResponseTeam" = true
WHERE "status" = 'ACTIVE'
  AND "isIncidentResponseTeam" = false
  AND (
    UPPER("code") IN ('IT','CNTT','ICT','HTTT')
    OR LOWER(TRIM("name")) IN (
      'it',
      'cntt',
      'ict',
      'công nghệ thông tin',
      'hệ thống thông tin',
      'information technology',
      'information systems'
    )
  );
