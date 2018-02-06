module.exports = {
  FIND_USER_BY_OPENID: `
SELECT * FROM user
WHERE openId = @openId;
  `,
  INSERT_USER: `
INSERT INTO user(openId, nickName, gender, language, city, province, country, avatarUrl, createDate, lastUpdateDate)
VALUES(@openId, @nickName, @gender, @language, @city, @province, @country, @avatarUrl, @createDate, @lastUpdateDate);
  `,
  UPDATE_USER: `
UPDATE user
SET nickName = @nickName, gender = @gender, language = @language, city = @city,
province = @province, country = @country, avatarUrl=@avatarUrl, lastUpdateDate = @lastUpdateDate
WHERE openId = @openId;
  `
};
