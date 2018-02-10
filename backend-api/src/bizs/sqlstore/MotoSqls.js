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
WHERE ownerId = @ownerId AND status=@status
ORDER BY lastUpdateDate DESC;
  `,
  GET_MOTO_FUEL_LIST: `
SELECT * FROM fuel_consumption
WHERE motoId = @motoId
ORDER BY id DESC;
  `,
  GET_LAST_FUEL: `
SELECT * FROM fuel_consumption
WHERE motoId = @motoId
ORDER BY id DESC LIMIT 1;
  `,
  GET_MOTO_STATISTICS_DATA: `
SELECT sum(refuelAmount) AS totalAmount, sum(fuelCount) AS totalFuel FROM fuel_consumption
WHERE motoId = @motoId AND id < @id;
  `,
  INSERT_FUEL_RECORD: `
INSERT INTO fuel_consumption(motoId, currentMileage, refuelDate, refuelAmount, uitlPrice, fuelCount, createDate)
VALUES(@motoId, @currentMileage, @refuelDate, @refuelAmount, @uitlPrice, @fuelCount, @createDate);
  `
};
