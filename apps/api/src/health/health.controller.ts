import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/auth.decorators';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}