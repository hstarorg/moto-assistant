-- 创建用户表
CREATE TABLE `user` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `openId` varchar(50) NOT NULL COMMENT 'OpenID',
  `nickName` varchar(50) NOT NULL COMMENT '昵称',
  `gender` varchar(50) NOT NULL COMMENT '性别',
  `language` varchar(50) NOT NULL COMMENT '语言',
  `city` varchar(50) NOT NULL COMMENT '城市',
  `province` varchar(50) NOT NULL COMMENT '省份',
  `country` varchar(50) NOT NULL COMMENT '国家',
  `avatarUrl` varchar(1000) NOT NULL COMMENT '头像地址',
  `createDate` bigint(20) NOT NULL COMMENT '加入时间',
  `lastUpdateDate` bigint(20) NOT NULL COMMENT '最后更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 创建车辆信息表
CREATE TABLE `moto` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `owerId` int(11) NOT NULL COMMENT '所属人',
  `motoName` varchar(100) NOT NULL COMMENT '车辆名称',
  `motoBuyDate` bigint(20) NOT NULL COMMENT '购买时间',
  `motoLicensePlate` varchar(50) NOT NULL COMMENT '车牌号',
  `motoPhotoUrl` varchar(1000) NOT NULL COMMENT '图片地址',
  `createDate` bigint(20) NOT NULL COMMENT '创建日期',
  `status` varchar(50) NOT NULL COMMENT '状态',
  `lastUpdateDate` bigint(20) NOT NULL COMMENT '最后更新日期',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


-- 创建加油信息
CREATE TABLE `fuel_consumption` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `motoId` int(11) NOT NULL COMMENT '车辆编号',
  `currentMileage` int(11) NOT NULL COMMENT '当前里程',
  `refuelDate` bigint(20) NOT NULL COMMENT '加油时间',
  `refuelAmount` decimal(38,0) NOT NULL COMMENT '加油总价',
  `uitlPrice` decimal(38,0) NOT NULL COMMENT '单价',
  `fuelCount` float NOT NULL COMMENT '加油量（L）',
  `createDate` bigint(20) NOT NULL COMMENT '登记时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
