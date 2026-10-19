import { TipReconciliationService } from './tip-reconciliation.service';

describe('TipReconciliationService', () => {
  afterEach(() => jest.useRealTimers());

  it('does not schedule queries when payment is disabled', () => {
    jest.useFakeTimers();
    const tips = { reconcileOrders: jest.fn() };
    const service = new TipReconciliationService(
      tips as never,
      { isEnabled: () => false } as never,
    );
    service.onApplicationBootstrap();
    expect(jest.getTimerCount()).toBe(0);
    expect(tips.reconcileOrders).not.toHaveBeenCalled();
  });

  it('runs immediately, prevents overlap and resumes from the returned cursor', async () => {
    jest.useFakeTimers();
    let finish!: (cursor: number) => void;
    const tips = {
      reconcileOrders: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<number>((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValue(0),
    };
    const service = new TipReconciliationService(
      tips as never,
      { isEnabled: () => true } as never,
    );
    service.onApplicationBootstrap();
    const running = service.run();
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(tips.reconcileOrders).toHaveBeenCalledTimes(1);
    finish(50);
    await running;
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(tips.reconcileOrders).toHaveBeenNthCalledWith(2, 50);
    await service.onApplicationShutdown();
    expect(jest.getTimerCount()).toBe(0);
  });
});
