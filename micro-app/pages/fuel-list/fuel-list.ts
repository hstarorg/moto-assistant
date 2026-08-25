import ajax = require('../../utils/ajax');
import messageBox = require('../../utils/messageBox');
import util = require('../../utils/util');
import type {
  FuelListResponse,
  FuelModel,
  FuelRecord,
  FuelRecordView,
  StatisticsData
} from '../../types';

type FuelModelPath = `fuelModel.${keyof FuelModel}`;
type FuelFormErrors = Record<keyof FuelModel, string>;

const FUEL_PAGE_SIZE = 20;
let fuelListRequestVersion = 0;

const createEmptyFuelErrors = (): FuelFormErrors => ({
  refuelDate: '',
  currentMileage: '',
  refuelAmount: '',
  unitPrice: ''
});

const copyFuelModel = (fuelModel: FuelModel): FuelModel => ({ ...fuelModel });

const fuelModelsEqual = (left: FuelModel, right: FuelModel): boolean => {
  return (
    left.refuelDate === right.refuelDate &&
    left.currentMileage === right.currentMileage &&
    left.refuelAmount === right.refuelAmount &&
    left.unitPrice === right.unitPrice
  );
};

const toFuelRecordView = (record: FuelRecord): FuelRecordView => {
  const refuelDate = util.formatTime(new Date(record.refuelDate), 'date');
  return {
    formValues: {
      currentMileage: String(record.currentMileage),
      refuelAmount: String(record.refuelAmount),
      refuelDate,
      unitPrice: String(record.unitPrice)
    },
    id: record.id,
    currentMileage: record.currentMileage,
    refuelDate,
    refuelAmount: util.fixed2ForNum(record.refuelAmount),
    unitPrice: util.fixed2ForNum(record.unitPrice),
    fuelCount: util.fixed2ForNum(record.fuelCount),
    updatedAt: util.formatTime(new Date(record.updatedAt)).slice(0, 16)
  };
};

const isNumberInRange = (
  value: string,
  minimum: number,
  maximum: number
): boolean => {
  const number = Number(value);
  return (
    value.trim() !== '' &&
    Number.isFinite(number) &&
    number >= minimum &&
    number <= maximum
  );
};

Page({
  data: {
    motoId: 0 as number | string,
    dateNowStr: util.formatTime(new Date(), 'date'),
    fuelList: [] as FuelRecordView[],
    isLoaded: false,
    isLoading: false,
    isLoadingMore: false,
    loadFailed: false,
    loadMoreFailed: false,
    nextCursor: null as string | null,
    totalCount: 0,
    fuelFormVisible: false,
    editingFuelId: null as number | null,
    originalFuelModel: null as FuelModel | null,
    statisticsData: {
      currentMileage: 0,
      totalMileage: 0,
      totalAmount: 0,
      avgFuel: 0,
      avgPrice: 0
    } as StatisticsData,
    fuelModel: {
      refuelDate: '',
      currentMileage: '',
      refuelAmount: '',
      unitPrice: ''
    } as FuelModel,
    fuelErrors: createEmptyFuelErrors(),
    isDeleting: false,
    isSubmitting: false,
    keyboardHeight: 0
  },

  onLoad(options) {
    this.setData({ motoId: options.motoId || 0 });
    this._loadFuelList();
  },

  _loadFuelList() {
    if (this.data.isLoading) {
      return;
    }
    const requestVersion = ++fuelListRequestVersion;
    this.setData({
      isLoading: true,
      isLoadingMore: false,
      loadMoreFailed: false,
      nextCursor: null
    });
    ajax
      .get<FuelListResponse>(
        `/motos/${this.data.motoId}/fuel?limit=${FUEL_PAGE_SIZE}`
      )
      .then(({ data }) => {
        if (requestVersion !== fuelListRequestVersion) {
          return;
        }
        this.setData({
          fuelList: data.fuelList.map(toFuelRecordView),
          loadFailed: false,
          nextCursor: data.nextCursor,
          statisticsData: data.statisticsData,
          totalCount: data.totalCount
        });
      })
      .catch(() => {
        if (requestVersion === fuelListRequestVersion) {
          this.setData({ loadFailed: true });
        }
      })
      .finally(() => {
        if (requestVersion === fuelListRequestVersion) {
          this.setData({ isLoaded: true, isLoading: false });
        }
      });
  },

  handleLoadMore() {
    this._loadMoreFuelList();
  },

  handleLoadMoreRetry() {
    this._loadMoreFuelList();
  },

  _loadMoreFuelList() {
    const cursor = this.data.nextCursor;
    if (
      !cursor ||
      this.data.isLoading ||
      this.data.isLoadingMore ||
      this.data.fuelFormVisible
    ) {
      return;
    }

    const requestVersion = fuelListRequestVersion;
    this.setData({ isLoadingMore: true, loadMoreFailed: false });
    void ajax
      .get<FuelListResponse>(
        `/motos/${this.data.motoId}/fuel?limit=${FUEL_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
        { showError: false, showLoading: false }
      )
      .then(({ data }) => {
        if (requestVersion !== fuelListRequestVersion) {
          return;
        }
        const loadedIds = new Set(this.data.fuelList.map(record => record.id));
        const nextRecords = data.fuelList
          .map(toFuelRecordView)
          .filter(record => !loadedIds.has(record.id));
        this.setData({
          fuelList: [...this.data.fuelList, ...nextRecords],
          nextCursor: data.nextCursor,
          statisticsData: data.statisticsData,
          totalCount: data.totalCount
        });
      })
      .catch(() => {
        if (requestVersion === fuelListRequestVersion) {
          this.setData({ loadMoreFailed: true });
        }
      })
      .finally(() => {
        if (requestVersion === fuelListRequestVersion) {
          this.setData({ isLoadingMore: false });
        }
      });
  },

  handleDataRetry() {
    this._loadFuelList();
  },

  updateCurrentMileage(event: WechatMiniprogram.Input) {
    this._setInputData('fuelModel.currentMileage', event.detail.value);
  },

  updateUnitPrice(event: WechatMiniprogram.Input) {
    this._setInputData('fuelModel.unitPrice', event.detail.value);
  },

  updateRefuelAmount(event: WechatMiniprogram.Input) {
    this._setInputData('fuelModel.refuelAmount', event.detail.value);
  },

  bindDateChange(event: WechatMiniprogram.PickerChange) {
    this._setInputData('fuelModel.refuelDate', event.detail.value as string);
  },

  handleKeyboardHeightChange(event: WechatMiniprogram.CustomEvent) {
    const detail = event.detail as { height?: number };
    const keyboardHeight = Math.max(0, detail.height || 0);
    if (keyboardHeight !== this.data.keyboardHeight) {
      this.setData({ keyboardHeight });
    }
  },

  _setInputData(key: FuelModelPath, value: string) {
    const field = key.slice('fuelModel.'.length) as keyof FuelModel;
    this.setData({
      [key]: value,
      [`fuelErrors.${field}`]: ''
    } as WechatMiniprogram.IAnyObject);
  },

  handleAddFuelClick() {
    this._openFuelForm(null, {
      refuelDate: util.formatTime(new Date(), 'date'),
      currentMileage: '',
      refuelAmount: '',
      unitPrice: ''
    });
  },

  handleEditFuelClick(
    event: WechatMiniprogram.CustomEvent<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject,
      { fuelId: number }
    >
  ) {
    const fuelId = Number(event.currentTarget.dataset.fuelId);
    const fuelRecord = this.data.fuelList.find(record => record.id === fuelId);
    if (!fuelRecord) {
      messageBox.toast('加油记录不存在，请刷新后重试');
      return;
    }

    this._openFuelForm(fuelId, fuelRecord.formValues);
  },

  _openFuelForm(editingFuelId: number | null, fuelModel: FuelModel) {
    this.setData({
      editingFuelId,
      fuelErrors: createEmptyFuelErrors(),
      fuelFormVisible: true,
      fuelModel: copyFuelModel(fuelModel),
      originalFuelModel: copyFuelModel(fuelModel),
      keyboardHeight: 0
    });
  },

  handleFuelFormCancel() {
    if (this.data.isSubmitting || this.data.isDeleting) {
      return;
    }

    if (!this._hasUnsavedFuelChanges()) {
      this._closeFuelForm();
      return;
    }

    wx.showModal({
      title: this.data.editingFuelId ? '放弃修改？' : '放弃填写？',
      content: '当前内容尚未保存。',
      confirmText: '放弃',
      confirmColor: '#b42318',
      success: result => {
        if (result.confirm) {
          this._closeFuelForm();
        }
      }
    });
  },

  _hasUnsavedFuelChanges(): boolean {
    const originalFuelModel = this.data.originalFuelModel;
    return (
      originalFuelModel !== null &&
      !fuelModelsEqual(this.data.fuelModel, originalFuelModel)
    );
  },

  _closeFuelForm() {
    this.setData({
      editingFuelId: null,
      fuelFormVisible: false,
      keyboardHeight: 0,
      originalFuelModel: null
    });
  },

  handleFuelFormSubmit() {
    if (this.data.isSubmitting || this.data.isDeleting) {
      return;
    }

    const fuelModel = this.data.fuelModel;
    const fuelErrors = createEmptyFuelErrors();
    if (!fuelModel.refuelDate) {
      fuelErrors.refuelDate = '请选择加油日期';
    }
    if (!isNumberInRange(fuelModel.currentMileage, 0, 99_999_999_999.9)) {
      fuelErrors.currentMileage = '请输入有效里程，且不能小于 0';
    }
    if (!isNumberInRange(fuelModel.unitPrice, 0.01, 999_999.9999)) {
      fuelErrors.unitPrice = '请输入大于 0 的有效油价';
    }
    if (!isNumberInRange(fuelModel.refuelAmount, 0.01, 9_999_999_999.99)) {
      fuelErrors.refuelAmount = '请输入大于 0 的有效金额';
    }

    this.setData({ fuelErrors });
    if (Object.values(fuelErrors).some(Boolean)) {
      return;
    }

    if (this.data.editingFuelId !== null) {
      if (!this._hasUnsavedFuelChanges()) {
        messageBox.toast('没有需要保存的修改');
        return;
      }
      wx.showModal({
        title: '确认修改这条记录？',
        content: `${fuelModel.refuelDate}，当前里程 ${fuelModel.currentMileage} 公里。保存后相关统计会重新计算。`,
        confirmText: '确认修改',
        success: ({ confirm }) => {
          if (confirm) {
            this._submitFuelRecord();
          }
        }
      });
      return;
    }

    this._submitFuelRecord();
  },

  _submitFuelRecord(confirmMileageAnomaly = false) {
    this.setData({ isSubmitting: true });
    const editingFuelId = this.data.editingFuelId;
    const data = {
      ...this.data.fuelModel,
      confirmMileageAnomaly
    } as unknown as WechatMiniprogram.IAnyObject;
    const request =
      editingFuelId === null
        ? ajax.post(`/motos/${this.data.motoId}/fuel`, data, {
            showError: false,
            showLoading: false
          })
        : ajax.put(
            `/motos/${this.data.motoId}/fuel/${editingFuelId}`,
            data,
            { showError: false, showLoading: false }
          );
    void request
      .then(() => {
        this._closeFuelForm();
        messageBox.success(editingFuelId === null ? '记录已添加' : '修改已保存');
        this._loadFuelList();
      })
      .catch(error => {
        if (
          !confirmMileageAnomaly &&
          ajax.isApiError(error, 409, 'MILEAGE_ANOMALY')
        ) {
          this._showMileageAnomaly(error);
          return;
        }
        messageBox.toast(
          error instanceof Error && error.message
            ? error.message
            : '保存失败，请稍后重试'
        );
      })
      .finally(() => {
        this.setData({ isSubmitting: false });
      });
  },

  _showMileageAnomaly(error: unknown) {
    const content =
      error instanceof Error && error.message
        ? error.message
        : '当前里程与相邻记录不一致，请检查后再保存。';
    wx.showModal({
      title: '里程可能有误',
      content,
      confirmText: '仍然保存',
      confirmColor: '#b42318',
      success: ({ confirm }) => {
        if (confirm) {
          this._submitFuelRecord(true);
        }
      }
    });
  },

  handleDeleteFuelClick() {
    if (
      this.data.editingFuelId === null ||
      this.data.isSubmitting ||
      this.data.isDeleting
    ) {
      return;
    }

    const originalFuelModel =
      this.data.originalFuelModel ?? this.data.fuelModel;
    wx.showModal({
      title: '删除这条加油记录？',
      content: `${originalFuelModel.refuelDate}，当前里程 ${originalFuelModel.currentMileage} 公里。删除后相关统计会重新计算。`,
      confirmText: '确认删除',
      confirmColor: '#b42318',
      success: ({ confirm }) => {
        if (confirm) {
          this._deleteFuelRecord();
        }
      }
    });
  },

  _deleteFuelRecord() {
    const fuelId = this.data.editingFuelId;
    if (fuelId === null) {
      return;
    }

    this.setData({ isDeleting: true });
    void ajax
      .delete(`/motos/${this.data.motoId}/fuel/${fuelId}`, {
        showLoading: false
      })
      .then(() => {
        this._closeFuelForm();
        messageBox.success('记录已删除');
        this._loadFuelList();
      })
      .catch(() => undefined)
      .finally(() => {
        this.setData({ isDeleting: false });
      });
  }
});
