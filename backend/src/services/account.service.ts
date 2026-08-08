import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { LessThanOrEqual, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../common';
import { AppConf } from '../constants';
import { AuthSessionEntity, UserEntity } from '../database';
import { CreateAccountTokenDto } from '../dto/create-account-token.dto';
import type { AccountTokenResponse, WechatUserProfile } from './service.types';
import { ThirdPartyService } from './third-party.service';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(AuthSessionEntity)
    private readonly authSessions: Repository<AuthSessionEntity>,
    private readonly thirdParty: ThirdPartyService,
  ) {}

  async createToken(dto: CreateAccountTokenDto): Promise<AccountTokenResponse> {
    const profile = await this.thirdParty.getWechatUserProfile(dto);
    let user = await this.users.findOneBy({ openId: profile.openId });

    if (user) {
      this.assignProfile(user, profile);
    } else {
      user = this.users.create(profile);
    }
    user = await this.users.save(user);

    const token = await this.issueToken(user.id);
    return {
      avatarUrl: user.avatarUrl,
      city: user.city,
      country: user.country,
      createdAt: user.createdAt.toISOString(),
      gender: user.gender,
      id: user.id,
      language: user.language,
      nickName: user.nickName,
      openId: user.openId,
      province: user.province,
      token,
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async authenticateToken(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.authSessions.findOneBy({
      tokenHash: this.hashToken(token),
    });
    if (!session) {
      return null;
    }

    const now = new Date(Date.now());
    if (now >= session.absoluteExpiresAt || now >= session.idleExpiresAt) {
      await this.authSessions.delete(session.id);
      return null;
    }

    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + AppConf.TOKEN_IDLE_TTL_MS,
        session.absoluteExpiresAt.getTime(),
      ),
    );
    await this.authSessions.update(session.id, { idleExpiresAt });
    return { id: session.userId };
  }

  private async issueToken(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date(Date.now());
    await this.deleteExpiredSessions(now);
    await this.authSessions.insert({
      absoluteExpiresAt: new Date(now.getTime() + AppConf.MAX_TOKEN_AGE_MS),
      idleExpiresAt: new Date(now.getTime() + AppConf.TOKEN_IDLE_TTL_MS),
      tokenHash: this.hashToken(token),
      userId,
    });
    return token;
  }

  private async deleteExpiredSessions(now: Date): Promise<void> {
    await this.authSessions.delete({
      absoluteExpiresAt: LessThanOrEqual(now),
    });
    await this.authSessions.delete({
      idleExpiresAt: LessThanOrEqual(now),
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private assignProfile(user: UserEntity, profile: WechatUserProfile): void {
    user.avatarUrl = profile.avatarUrl;
    user.city = profile.city;
    user.country = profile.country;
    user.gender = profile.gender;
    user.language = profile.language;
    user.nickName = profile.nickName;
    user.province = profile.province;
  }
}
