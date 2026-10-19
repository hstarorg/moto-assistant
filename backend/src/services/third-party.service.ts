import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

interface WechatSessionResponse {
  errcode?: number;
  errmsg?: string;
  openid?: string;
  session_key?: string;
}

interface WechatAccessTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
}

export interface WechatSession {
  openId: string;
  sessionKey: string;
}

interface WechatConfig {
  appId: string;
  appSecret: string;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  keyPrefix: string;
}

@Injectable()
export class ThirdPartyService implements OnApplicationShutdown {
  private readonly logger = new Logger(ThirdPartyService.name);
  private accessToken?: { expiresAt: number; value: string };
  private accessTokenRequest?: Promise<string>;
  private readonly r2: R2Config;
  private readonly r2Client: S3Client;
  private readonly wechat: WechatConfig;

  constructor(config: ConfigService) {
    this.r2 = this.parseR2Config(config.getOrThrow<string>('R2_CONFIG'));
    this.wechat = this.parseWechatConfig(
      config.getOrThrow<string>('WECHAT_CONFIG'),
    );
    this.r2Client = new S3Client({
      credentials: {
        accessKeyId: this.r2.accessKeyId,
        secretAccessKey: this.r2.secretAccessKey,
      },
      endpoint: `https://${this.r2.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
    });
  }

  onApplicationShutdown(): void {
    this.r2Client.destroy();
  }

  async getWechatOpenId(code: string): Promise<string> {
    return (await this.getWechatSession(code)).openId;
  }

  async getWechatSession(code: string): Promise<WechatSession> {
    return this.getWechatSessionFromCode(
      code,
      this.wechat.appId,
      this.wechat.appSecret,
    );
  }

  async getWechatAccessToken(rejectedToken?: string): Promise<string> {
    if (
      rejectedToken !== undefined &&
      this.accessToken?.value === rejectedToken
    ) {
      this.accessToken = undefined;
    }
    if (
      this.accessToken &&
      this.accessToken.expiresAt > Date.now() + 60 * 1000
    ) {
      return this.accessToken.value;
    }
    if (!this.accessTokenRequest) {
      this.accessTokenRequest = this.requestWechatAccessToken().finally(() => {
        this.accessTokenRequest = undefined;
      });
    }
    return this.accessTokenRequest;
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImageToR2(file);
  }

  async getImageUrl(
    imageKey: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.r2Client,
      new GetObjectCommand({ Bucket: this.r2.bucket, Key: imageKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  private async uploadImageToR2(file: Express.Multer.File): Promise<string> {
    const key = this.createImageKey(file.originalname, this.r2.keyPrefix);
    await this.r2Client.send(
      new PutObjectCommand({
        Body: file.buffer,
        Bucket: this.r2.bucket,
        CacheControl: 'private, max-age=3600',
        ContentLength: file.size,
        ContentType: file.mimetype,
        Key: key,
      }),
    );
    return key;
  }

  private async getWechatSessionFromCode(
    code: string,
    appId: string,
    appSecret: string,
  ): Promise<WechatSession> {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    }).toString();

    const session = await this.requestWechatJson<WechatSessionResponse>(
      url,
      '微信登录服务暂时不可用',
    );
    if (
      typeof session.openid !== 'string' ||
      !session.openid ||
      typeof session.session_key !== 'string' ||
      !session.session_key
    ) {
      this.logWechatFailure(
        '/sns/jscode2session',
        'WECHAT_LOGIN_INVALID',
        session.errcode,
      );
      throw new ForbiddenException({
        code: 'WECHAT_LOGIN_INVALID',
        message: '微信登录凭证无效',
      });
    }
    return { openId: session.openid, sessionKey: session.session_key };
  }

  private async requestWechatAccessToken(): Promise<string> {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.search = new URLSearchParams({
      appid: this.wechat.appId,
      grant_type: 'client_credential',
      secret: this.wechat.appSecret,
    }).toString();

    const result = await this.requestWechatJson<WechatAccessTokenResponse>(
      url,
      '微信服务暂时不可用',
    );
    if (
      typeof result.access_token !== 'string' ||
      !result.access_token ||
      !Number.isSafeInteger(result.expires_in) ||
      (result.expires_in ?? 0) <= 0
    ) {
      this.logWechatFailure(
        '/cgi-bin/token',
        'WECHAT_ACCESS_TOKEN_FAILED',
        result.errcode,
      );
      throw new BadGatewayException({
        code: 'WECHAT_ACCESS_TOKEN_FAILED',
        message: '微信服务暂时不可用',
      });
    }
    this.accessToken = {
      expiresAt: Date.now() + (result.expires_in ?? 0) * 1000,
      value: result.access_token,
    };
    return result.access_token;
  }

  private async requestWechatJson<T>(url: URL, message: string): Promise<T> {
    const signal = AbortSignal.timeout(5000);
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error();
      }
      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        Array.isArray(result)
      ) {
        throw new Error();
      }
      return result as T;
    } catch {
      const code = signal.aborted
        ? 'WECHAT_REQUEST_TIMEOUT'
        : 'WECHAT_REQUEST_FAILED';
      this.logWechatFailure(url.pathname, code);
      throw new BadGatewayException({
        code,
        message,
      });
    }
  }

  private logWechatFailure(
    operation: string,
    code: string,
    upstreamCode?: number,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'wechat_request_failure',
        operation,
        code,
        upstreamCode: Number.isSafeInteger(upstreamCode)
          ? upstreamCode
          : undefined,
      }),
    );
  }

  private createImageKey(originalName: string, prefix: string): string {
    const extension = extname(originalName).toLowerCase() || '.jpg';
    return `${prefix.replace(/^\/+|\/+$/g, '')}/${randomUUID()}${extension}`;
  }

  private parseR2Config(value: string): R2Config {
    const parts = value.split('|');
    if (
      (parts.length !== 5 && parts.length !== 6) ||
      parts.slice(0, 5).some((part) => part.length === 0)
    ) {
      throw new Error(
        'R2_CONFIG 格式不正确，应为 accountId|accessKeyId|secretAccessKey|bucket|keyPrefix',
      );
    }

    const [accountId, accessKeyId, secretAccessKey, bucket, keyPrefix] = parts;

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      keyPrefix,
    };
  }

  private parseWechatConfig(value: string): WechatConfig {
    const parts = value.split('|');
    if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
      throw new Error('WECHAT_CONFIG 格式不正确，应为 appId|appSecret');
    }

    const [appId, appSecret] = parts;
    return { appId, appSecret };
  }
}
