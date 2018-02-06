module.exports = {
  CREATE_MOTO: `
INSERT INTO moto(owerId, motoName, motoBuyDate, motoLicensePlate, motoPhotoUrl, createDate, Status)
VALUES(@ownerId, @motoName, @motoBuyDate, @motoLicensePlate, @motoPhotoUrl, @createDate, @Status);
  `,
  UPDATE_MOTO: `
UPDATE moto
SET owerId = @ownerId, motoName = @motoName, motoBuyDate = @motoBuyDate, motoLicensePlate = @motoLicensePlate,
motoPhotoUrl = @motoPhotoUrl, createDate = @createDate, Status = @Status
WHERE id = @id;  
  `
};
