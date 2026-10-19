import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ThirdPartyService } from './third-party.service';

describe('ThirdPartyService WeChat requests', () => {
  let service: ThirdPartyService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new ThirdPartyService(
      new ConfigService({
        WECHAT_CONFIG: 'wx-test|placeholder-secret',
        R2_CONFIG:
          'placeholder-account|placeholder-key|placeholder-secret|placeholder-bucket|images',
      }),
    );
  });

  afterEach(() => {
    service.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('shares token refreshes and does not invalidate a newer token for a delayed rejection', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'old-token', expires_in: 7200 }),
        ),
      );
    expect(await service.getWechatAccessToken()).toBe('old-token');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.getWechatAccessToken('old-token');
    const second = service.getWechatAccessToken('old-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    finish(
      new Response(
        JSON.stringify({ access_token: 'new-token', expires_in: 7200 }),
      ),
    );
    expect(await Promise.all([first, second])).toEqual([
      'new-token',
      'new-token',
    ]);
    expect(await service.getWechatAccessToken('old-token')).toBe('new-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears a failed token refresh so the next request can recover', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('private request details'));
    await expect(service.getWechatAccessToken()).rejects.toMatchObject({
      response: { code: 'WECHAT_REQUEST_FAILED' },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'new-token', expires_in: 7200 }),
      ),
    );
    expect(await service.getWechatAccessToken()).toBe('new-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds login requests and hides upstream failure details', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('placeholder-secret'));
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort());
    await expect(
      service.getWechatSession('placeholder-code'),
    ).rejects.toMatchObject({
      response: {
        code: 'WECHAT_REQUEST_TIMEOUT',
        message: '微信登录服务暂时不可用',
      },
    });
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(
      (Logger.prototype.warn as jest.Mock).mock.calls,
    );
    expect(logged).not.toContain('placeholder-secret');
    expect(logged).not.toContain('placeholder-code');
  });

  it('handles invalid login JSON as a sanitized upstream error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('not-json'));
    await expect(
      service.getWechatSession('placeholder-code'),
    ).rejects.toMatchObject({
      response: { code: 'WECHAT_REQUEST_FAILED' },
    });
  });
});
