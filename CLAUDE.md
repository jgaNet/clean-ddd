# Clean DDD Project Guidelines

## Build & Test Commands
```
yarn build              # Build the project
yarn lint               # Run eslint
yarn format             # Run prettier
yarn test               # Run all tests
yarn test:watch         # Run tests in watch mode
yarn test -- -t "test name" # Run specific test
```

## Code Style Guidelines
- **Architecture**: Follow Clean Architecture & DDD principles
- **Types**: Use strict TypeScript typing; avoid `any`/`unknown` where possible
- **Naming**: 
  - PascalCase: classes, interfaces, types
  - camelCase: variables, methods, properties
  - Prefix interfaces with "I" (IUserRepository)
  - Suffix handlers, events, repositories appropriately
- **Pattern**: CQRS pattern with Command/Query handlers
- **Error Handling**: Use Result<T> pattern over exceptions when possible
- **Testing**: Write unit tests for domain logic, use mocks for isolation
- **Imports**: Group by layer (Domain → Application → Infrastructure → Presentation)
- **Commits**: Follow conventional commit format (feat:, fix:, refactor:)