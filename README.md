# Clean DDD Framework

## 🚀 Overview

Welcome to the **Clean DDD Framework**, an architecture-driven project that leverages **Domain-Driven Design (DDD)** and **Clean Architecture** principles for building scalable, maintainable applications. This project follows a modular, event-driven, and CQRS (Command Query Responsibility Segregation) structure.

## 📚 Documentation

For comprehensive documentation on the framework, please visit our [Wiki](https://github.com/YourUsername/clean-ddd/wiki).

The wiki includes detailed information on:

- [Architecture Overview](https://github.com/YourUsername/clean-ddd/wiki/Architecture-Overview)
- [Project Structure](https://github.com/YourUsername/clean-ddd/wiki/Project-Structure)
- [Core Components](https://github.com/YourUsername/clean-ddd/wiki/Core-Components)
- [Request Flow](https://github.com/YourUsername/clean-ddd/wiki/Request-Flow)
- [Adding New Features](https://github.com/YourUsername/clean-ddd/wiki/Adding-New-Features)
- [Testing](https://github.com/YourUsername/clean-ddd/wiki/Testing)
- [Best Practices](https://github.com/YourUsername/clean-ddd/wiki/Best-Practices)

## 🏗️ Architecture & Design Principles

### 🔍 Key Concepts

- **Domain-Driven Design (DDD):** Core business logic is isolated from infrastructure code.
- **Clean Architecture:** Dependency inversion with clear separation of concerns.
- **CQRS:** Commands and Queries are segregated for scalability and clear logic separation.
- **Event-Driven:** Modules communicate through events, supporting scalability and decoupled services.

## 📁 Project Structure

```
clean-ddd/
│
├── src/                      # Main source code directory
│   ├── @Primitives/           # Core abstractions (Event, CommandHandler, etc.)
│   ├── Bootstrap/             # Application setup and Fastify configurations
│   ├── Contexts/              # Bounded contexts (e.g., UsersManager)
│   │   └── UsersManager/
│   │       ├── Application/   # Use cases and interactions
│   │       │   ├── Commands/  # Command handlers
│   │       │   ├── Events/    # Event handlers 
│   │       │   └── Queries/   # Query handlers
│   │       ├── Domain/        # Business logic layer
│   │       ├── Infrastructure/ # Persistence and repositories
│   │       └── Presentation/  # API Layer
│   └── Shared/                # Shared infrastructure and common utilities
│
├── deployments/              # Deployment configurations
├── package.json              # Project dependencies and scripts
└── tsconfig.json             # TypeScript configuration
```

## ⚡ Quick Start

1. Clone the repository
   ```bash
   git clone https://github.com/YourUsername/clean-ddd.git
   cd clean-ddd
   ```

2. Install dependencies
   ```bash
   yarn install
   ```

3. Start the development server
   ```bash
   yarn dev
   ```

4. Run tests
   ```bash
   yarn test
   ```

## ✅ Code Quality & Best Practices

- **Linting:** Use ESLint for code quality checks (`yarn lint`).
- **Formatting:** Prettier is set up for code formatting (`yarn format`).
- **Testing:** Jest for unit testing (`yarn test`).

## 📚 Documentation & References

- [Domain-Driven Design Reference](https://domainlanguage.com/ddd/)
- [Clean Architecture Principles](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [CQRS Explained](https://martinfowler.com/bliki/CQRS.html)

## 💡 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/awesome-feature`)
3. Commit changes using conventional commit format
4. Push to the branch and open a Pull Request

## 📄 License

This project is licensed under the MIT License.

---

Happy coding! 🚀