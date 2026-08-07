import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports that the service is healthy', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });
});
