import { Operation, IOperation } from '@Shared/Domain/Operation';
import { Mapper, Event } from '@Primitives';

export class OperationMapperImpl implements Mapper<Operation<Event<unknown>>, IOperation> {
  toJSON(operation: Operation<Event<unknown>>): IOperation {
    return {
      id: operation.id,
      status: operation.status,
      createdAt: operation.createdAt,
      finishedAt: operation.finishedAt,
      event: {
        name: operation.event.name,
        payload: operation.event.payload,
      },
      result: operation.result,
    };
  }

  toEntity(operation: IOperation): Operation<Event<unknown>> {
    const operationEntity = new Operation({
      id: operation.id,
      status: operation.status,
      createdAt: operation.createdAt,
      finishedAt: operation.finishedAt,
      event: operation.event,
      result: operation.result,
    });

    return operationEntity;
  }
}

export const OperationMapper = new OperationMapperImpl();
