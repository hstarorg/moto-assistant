import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import * as qiniu from 'qiniu';
import { CreateAccountTokenDto } from '../dto/create-account-token.dto';
import type { WechatUserProfile } from './service.types';

interface WechatSessionResponse {
  openid?: string;
  session_key?: string;
}

interface WechatWatermark {
  appid?: string;
}

interface DecryptedWechatProfile {
  avatarUrl?: unknown;
  city?: unknown;
  country?: unknown;
  gender?: unknown;
  language?: unknown;
  nickName?: unknown;
  province?: unknown;
  watermark?: WechatWatermark;
}

@Injectable()
export class ThirdPartyService {
  constructor(private readonly config: ConfigService) {}

  async getWechatUserProfile(
    dto: CreateAccountTokenDto,
  ): Promise<WechatUserProfile> {
    const appId = this.config.get<string>('WECHAT_APP_ID');
    const appSecret = this.config.get<string>('WECHAT_APP_SECRET');
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('微信登录服务未配置。');
    }

    const session = await this.getWechatSession(dto.code, appId, appSecret);
    const profile = this.decryptWechatProfile(
      dto.encryptedData,
      dto.iv,
      session.session_key,
      appId,
    );

    return {
      avatarUrl: this.toString(profile.avatarUrl),
      city: this.toString(profile.city),
      country: this.toString(profile.country),
      gender: this.toString(profile.gender),
      language: this.toString(profile.language),
      nickName: this.toString(profile.nickName),
      openId: session.openid,
      province: this.toString(profile.province),
    };
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    const accessKey = this.config.get<string>('QINIU_ACCESS_KEY');
    const secretKey = this.config.get<string>('QINIU_SECRET_KEY');
    const bucket = this.config.get<string>('QINIU_BUCKET') ?? 'autoupload';
    const imageBaseUrl = this.config.get<string>('IMAGE_BASE_URL');
    if (!accessKey || !secretKey || !imageBaseUrl) {
      throw new ServiceUnavailableException('图片上传服务未配置。');
    }

    const prefix =
      this.config.get<string>('QINIU_KEY_PREFIX') ?? 'moto_assistant';
    const extension = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${prefix}/${randomUUID()}${extension}`;
    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const uploadToken = new qiniu.rs.PutPolicy({ scope: bucket }).uploadToken(
      mac,
    );
    const uploader = new qiniu.form_up.FormUploader(new qiniu.conf.Config());
    const putExtra = new qiniu.form_up.PutExtra();
    putExtra.fname = file.originalname;
    putExtra.mimeType = file.mimetype;

    try {
      const result = await uploader.put(
        uploadToken,
        key,
        file.buffer,
        putExtra,
      );
      if (!result.ok()) {
        throw new Error('Upload failed');
      }
    } catch {
      throw new BadGatewayException('图片上传失败，请稍后重试。');
    }

    return `${imageBaseUrl.replace(/\/+$/, '')}/${key}`;
  }

  private async getWechatSession(
    code: string,
    appId: string,
    appSecret: string,
  ): Promise<Required<Pick<WechatSessionResponse, 'openid' | 'session_key'>>> {
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
      throw new BadGatewayException('微信登录服务暂时不可用。');
    }

    if (!response.ok) {
      throw new BadGatewayException('微信登录服务暂时不可用。');
    }

    const session = (await response.json()) as WechatSessionResponse;
    if (!session.openid || !session.session_key) {
      throw new ForbiddenException('微信登录凭证无效。');
    }
    return { openid: session.openid, session_key: session.session_key };
  }

  private decryptWechatProfile(
    encryptedData: string,
    iv: string,
    sessionKey: string,
    appId: string,
  ): DecryptedWechatProfile {
    try {
      const decipher = createDecipheriv(
        'aes-128-cbc',
        Buffer.from(sessionKey, 'base64'),
        Buffer.from(iv, 'base64'),
      );
      decipher.setAutoPadding(true);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData, 'base64')),
        decipher.final(),
      ]);
      const profile = JSON.parse(
        decrypted.toString('utf8'),
      ) as DecryptedWechatProfile;

      if (profile.watermark?.appid !== appId) {
        throw new Error('Unexpected app id');
      }
      return profile;
    } catch {
      throw new ForbiddenException('微信用户信息校验失败。');
    }
  }

  private toString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }
}
