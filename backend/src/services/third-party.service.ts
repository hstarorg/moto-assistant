import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

interface WechatSessionResponse {
  openid?: string;
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
  publicBaseUrl: string;
}

@Injectable()
export class ThirdPartyService implements OnApplicationShutdown {
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
    return this.getWechatOpenIdFromCode(
      code,
      this.wechat.appId,
      this.wechat.appSecret,
    );
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImageToR2(file);
  }

  private async uploadImageToR2(file: Express.Multer.File): Promise<string> {
    const key = this.createImageKey(file.originalname, this.r2.keyPrefix);
    await this.r2Client.send(
      new PutObjectCommand({
        Body: file.buffer,
        Bucket: this.r2.bucket,
        CacheControl: 'public, max-age=31536000, immutable',
        ContentLength: file.size,
        ContentType: file.mimetype,
        Key: key,
      }),
    );
    return this.buildPublicUrl(this.r2.publicBaseUrl, key);
  }

  private async getWechatOpenIdFromCode(
    code: string,
    appId: string,
    appSecret: string,
  ): Promise<string> {
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    }).toString();

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new BadGatewayException('微信登录服务暂时不可用');
    }

    if (!response.ok) {
      throw new BadGatewayException('微信登录服务暂时不可用');
    }

    const session = (await response.json()) as WechatSessionResponse;
    if (!session.openid) {
      throw new ForbiddenException('微信登录凭证无效');
    }
    return session.openid;
  }

  private createImageKey(originalName: string, prefix: string): string {
    const extension = extname(originalName).toLowerCase() || '.jpg';
    return `${prefix.replace(/^\/+|\/+$/g, '')}/${randomUUID()}${extension}`;
  }

  private buildPublicUrl(baseUrl: string, key: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${key}`;
  }

  private parseR2Config(value: string): R2Config {
    const parts = value.split('|');
    if (parts.length !== 6 || parts.some((part) => part.length === 0)) {
      throw new Error(
        'R2_CONFIG 格式不正确，应为 accountId|accessKeyId|secretAccessKey|bucket|keyPrefix|publicBaseUrl',
      );
    }

    const [
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      keyPrefix,
      publicBaseUrl,
    ] = parts;
    const url = new URL(publicBaseUrl);
    if (url.protocol !== 'https:') {
      throw new Error('R2_CONFIG 中的 publicBaseUrl 必须使用 HTTPS');
    }

    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      keyPrefix,
      publicBaseUrl,
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
