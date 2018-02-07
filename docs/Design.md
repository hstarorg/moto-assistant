# Moto-Assistant

数据库选择为 Mysql

## 用户信息

整体基于微信的用户体系，所以存储的信息为微信给到的内容。

微信给出的信息如下： 

```json
{
  "openId": "o-Ree4s6_eNtlkaJCAYeGey3sX6M",
  "nickName": "幻☆精灵",
  "gender": 1,
  "language": "zh_CN",
  "city": "Chengdu",
  "province": "Sichuan",
  "country": "China",
  "avatarUrl": "https://wx.qlogo.cn/mmopen/vi_32/PiajxSqBRaELf0o9iaZYxI5YFib0Aib8Atu2eEj1AmXmqUGIeUj457NZpniac8RgNMY22xJp3Gu6ibhjPNeuzBgoWQ2w/0"
}
```

## 车辆信息

需要记录的车辆信息为：

```
{
  车辆名称：string,
  购买时间：date,
  车牌号：string,
  图片：string
}
```

## 油耗信息

第一阶段，先关注油耗信息，此时需要记录的单次油耗数据为：

```
{
  当前里程：number,
  加油时间：date,
  加油总价：decimal,
  油价： decimal,
  [加油量]: float, 由加油总价 / 油价
}
```
