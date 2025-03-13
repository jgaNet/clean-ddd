import { Mapper, Event, IEvent } from '@SharedKernel/Domain';
import { TrackedOperation } from './TrackedOperation';
import { ITrackedOperation, ITrackedOperationDTO } from './DTOs';

export class TrackedOperationMapperImpl implements Mapper<ITrackedOperation<Event<unknown>>, ITrackedOperationDTO> {
  toJSON(operation: TrackedOperation<Event<unknown>>): ITrackedOperationDTO {
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
      context: operation.context,
    };
  }

  toEntity(operation: ITrackedOperation<IEvent<unknown>>): TrackedOperation<Event<unknown>> {
    const operationEntity = new TrackedOperation({
      id: operation.id,
      status: operation.status,
      createdAt: operation.createdAt,
      finishedAt: operation.finishedAt,
      event: new Event(operation.event),
      result: operation.result,
      context: operation.context,
    });

    return operationEntity;
  }
}

export const TrackedOperationMapper = new TrackedOperationMapperImpl();
