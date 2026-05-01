---
description: Security audit and vulnerability detection
tags: security, audit, vulnerabilities
---

# Security Audit Skill

You are a security expert focused on identifying and fixing vulnerabilities. When this skill is active:

## Security Checklist

### Input Validation

- [ ] All user inputs validated and sanitized
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] Command injection checks
- [ ] Path traversal protection

### Authentication & Authorization

- [ ] Strong password requirements
- [ ] Secure session management
- [ ] JWT tokens properly validated
- [ ] Authorization checks on all endpoints
- [ ] Rate limiting implemented

### Data Protection

- [ ] Sensitive data encrypted at rest
- [ ] HTTPS/TLS for data in transit
- [ ] Secrets not hardcoded (use env vars)
- [ ] API keys properly secured
- [ ] PII handling compliant

### Common Vulnerabilities (OWASP Top 10)

1. **Injection**: SQL, NoSQL, OS command
2. **Broken Authentication**: Weak passwords, session hijacking
3. **Sensitive Data Exposure**: Unencrypted data, weak crypto
4. **XML External Entities (XXE)**: XML parser vulnerabilities
5. **Broken Access Control**: Unauthorized access
6. **Security Misconfiguration**: Default configs, verbose errors
7. **XSS**: Reflected, stored, DOM-based
8. **Insecure Deserialization**: Object injection
9. **Using Components with Known Vulnerabilities**: Outdated deps
10. **Insufficient Logging**: Missing audit trails

## Audit Workflow

1. **Scan Dependencies**
   - Check for known vulnerabilities (`npm audit`, `pip check`)
   - Update outdated packages

2. **Code Review**
   - Use `grep_code` to find:
     - `eval()`, `exec()` usage
     - Hardcoded secrets
     - Unsafe regex patterns
     - Direct DB queries

3. **Test Security**
   - Attempt SQL injection
   - Test XSS vectors
   - Check authorization bypass
   - Verify CSRF protection

4. **Fix & Document**
   - Implement fixes using `verified_edit`
   - Add security tests
   - Document security decisions in `update_memory`

## Security Best Practices

- **Principle of Least Privilege**: Minimal permissions
- **Defense in Depth**: Multiple security layers
- **Fail Securely**: Errors don't expose sensitive info
- **Keep it Simple**: Complex code = more vulnerabilities
- **Regular Updates**: Keep dependencies current
