.. _contributing:

Contributing
============

Contributions are welcome. Please follow these guidelines.

Code Style
----------

- JavaScript (Node.js) — ESLint configuration in each service's ``package.json``
- React (Frontend) — ESLint with React and React Hooks plugins
- SQL — Snake_case identifiers, uppercase keywords
- All services require Node.js >= 20.0.0

Branch Convention
-----------------

- ``main`` — Stable release branch
- ``feature/<name>`` — New features
- ``fix/<name>`` — Bug fixes
- ``docs/<name>`` — Documentation changes

Pull Request Process
--------------------

1. Fork the repository
2. Create a feature branch
3. Make changes with tests where applicable
4. Run ``npm audit --omit=dev`` to ensure no vulnerabilities
5. Ensure ESLint passes (``npm run lint``)
6. Submit a PR with a clear description

Testing
-------

- API: ``cd api && npm test`` (Jest + Supertest)
- Frontend: ``cd frontend && npm run build`` (build verification)
- Each service: ``npm audit --omit=dev`` for dependency security

Security Disclosures
--------------------

Report security vulnerabilities to ``dev@ionsec.io`` rather than filing a public issue.
