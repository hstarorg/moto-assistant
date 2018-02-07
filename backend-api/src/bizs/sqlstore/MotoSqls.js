module.exports = {
  CREATE_MOTO: `
INSERT INTO moto(owerId, motoName, motoBuyDate, motoLicensePlate, motoPhotoUrl, createDate, status, lastUpdateDate)
VALUES(@ownerId, @motoName, @motoBuyDate, @motoLicensePlate, @motoPhotoUrl, @createDate, @status, @lastUpdateDate);
  `,
  UPDATE_MOTO: `
UPDATE moto
SET owerId = @ownerId, motoName = @motoName, motoBuyDate = @motoBuyDate, motoLicensePlate = @motoLicensePlate,
motoPhotoUrl = @motoPhotoUrl, lastUpdateDate = @lastUpdateDate, Status = @Status
WHERE id = @id;  
  `
};
