import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from './health.module';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 and service metadata', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      service: 'agent-builder-api',
      version: expect.any(String),
    });
  });

  it('GET /healthz returns 200 (alias)', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  describe('HealthController (unit)', () => {
    it('returns ok payload directly', () => {
      const controller = new HealthController();
      const result = controller.check();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('agent-builder-api');
      expect(typeof result.version).toBe('string');
    });
  });
});
