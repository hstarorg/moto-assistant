# Moto-Assistant

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
  [加油量]: decimal, 由加油总价 / 油价
}
```
