import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../common/api-error';
import { ErrandStatus, ErrandUrgency, UserRole } from '../common/enums';
import { UpdateErrandDto } from './dto/errand.dto';
import { Errand } from './errand.entity';
import { ErrandsService } from './errands.service';

/** PATCH /errands/:id: only sent fields change; row 237 new deadline before payment. */
const build = (status: ErrandStatus) => {
  const errand = { id: 'e-1', customerId: 'c-1', status, title: 'Old title' } as Errand;
  const repo = { update: vi.fn(() => Promise.resolve()) };
  const service = new ErrandsService(
    {} as never,
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    {} as never,
    {} as never,
  );
  Object.assign(service, {
    getById: vi.fn(() => Promise.resolve(errand)),
    getDetail: vi.fn(() => Promise.resolve(errand)),
  });
  return { service, repo };
};

const OWNER = { role: UserRole.CUSTOMER, userId: 'u-1' };

const fails = async (p: Promise<unknown>) => {
  const err = await p.catch((e: unknown) => e);
  return (err as ApiError).getResponse() as Record<string, unknown>;
};

describe('ErrandsService.updateErrand', () => {
  it('a deadline-only patch keeps the title, sets the deadline and derives urgency', async () => {
    const { service, repo } = build(ErrandStatus.ACCEPTED);
    const at = new Date(Date.now() + 2 * 3_600_000);
    await service.updateErrand('e-1', { deadlineAt: at.toISOString() }, OWNER);
    expect(repo.update).toHaveBeenCalledWith('e-1', { deadlineAt: at, urgency: ErrandUrgency.URGENT });
  });

  it('a title-only patch leaves the deadline; null clears the title', async () => {
    const { service, repo } = build(ErrandStatus.QUOTED);
    await service.updateErrand('e-1', { title: 'New title' }, OWNER);
    expect(repo.update).toHaveBeenCalledWith('e-1', { title: 'New title' });
    await service.updateErrand('e-1', { title: null }, OWNER);
    expect(repo.update).toHaveBeenLastCalledWith('e-1', { title: null });
  });

  it('refuses a deadline after payment (deadline_not_editable) and one in the past (deadline_in_past)', async () => {
    const paid = build(ErrandStatus.PAYMENT_CONFIRMED);
    expect(
      await fails(paid.service.updateErrand('e-1', { deadlineAt: new Date(Date.now() + 3_600_000).toISOString() }, OWNER)),
    ).toMatchObject({ statusCode: 409, code: 'deadline_not_editable', status: 'PAYMENT_CONFIRMED' });
    expect(paid.repo.update).not.toHaveBeenCalled();
    const open = build(ErrandStatus.ACCEPTED);
    expect(await fails(open.service.updateErrand('e-1', { deadlineAt: new Date(Date.now() - 60_000).toISOString() }, OWNER))).toMatchObject({
      code: 'deadline_in_past',
    });
  });

  it('an admin cannot set the deadline (row 243: 403 deadline_customer_only); an admin title edit still works', async () => {
    const { service, repo } = build(ErrandStatus.QUOTED);
    const admin = { role: UserRole.ADMIN, userId: 'admin-1' };
    expect(
      await fails(service.updateErrand('e-1', { deadlineAt: new Date(Date.now() + 3_600_000).toISOString() }, admin)),
    ).toMatchObject({ statusCode: 403, code: 'deadline_customer_only' });
    expect(repo.update).not.toHaveBeenCalled();
    await service.updateErrand('e-1', { title: 'Ops title' }, admin);
    expect(repo.update).toHaveBeenCalledWith('e-1', { title: 'Ops title' });
  });

  it('the DTO refuses deadlineAt null', async () => {
    const errors = await validate(plainToInstance(UpdateErrandDto, { deadlineAt: null }));
    expect(errors.map((e) => e.property)).toContain('deadlineAt');
  });
});
