module.exports = {
  CREATE_MOTO: `
INSERT INTO moto(ownerId, motoName, motoBuyDate, motoLicensePlate, motoPhotoUrl, createDate, status, lastUpdateDate)
VALUES(@ownerId, @motoName, @motoBuyDate, @motoLicensePlate, @motoPhotoUrl, @createDate, @status, @lastUpdateDate);
  `,
  UPDATE_MOTO: `
UPDATE moto
SET ownerId = @ownerId, motoName = @motoName, motoBuyDate = @motoBuyDate, motoLicensePlate = @motoLicensePlate,
motoPhotoUrl = @motoPhotoUrl, lastUpdateDate = @lastUpdateDate, Status = @Status
WHERE id = @id;  
  `,
  GET_USER_MOTO_LIST: `
SELECT * FROM moto
WHERE ownerId = @ownerId
ORDER BY lastUpdateDate DESC;
  `
};
