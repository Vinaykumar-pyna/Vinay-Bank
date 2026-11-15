import { Badge, Col, Container, Nav, Navbar, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import { Logo } from '@/components/common/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { env } from '@/config/env';
import { ApiStatus } from './ApiStatus';

const features = [
  {
    icon: 'bi-lightning-charge',
    tone: 'primary',
    title: 'Instant transfers',
    text: 'Move money between accounts or to any bank over IMPS, NEFT and RTGS, with OTP confirmation and per-day limits.',
  },
  {
    icon: 'bi-credit-card-2-front',
    tone: 'success',
    title: 'Virtual debit cards',
    text: 'Issue a card in seconds, set ATM, POS and online limits, block or unblock instantly and manage your PIN.',
  },
  {
    icon: 'bi-cpu',
    tone: 'warning',
    title: 'ISO 8583 card switch',
    text: 'ATM and POS transactions travel as ISO 8583 messages over TLS sockets, with PIN blocks and message authentication.',
  },
  {
    icon: 'bi-people',
    tone: 'info',
    title: 'Maker-checker controls',
    text: 'High-value transfers, new accounts and cash operations need a second person to approve them.',
  },
  {
    icon: 'bi-link-45deg',
    tone: 'danger',
    title: 'Tamper-evident audit trail',
    text: 'Every sensitive action is chained with SHA-256, so any edit to history is detected instantly.',
  },
  {
    icon: 'bi-bell',
    tone: 'secondary',
    title: 'Real-time alerts',
    text: 'Credits, debits, logins and approvals arrive instantly over secure WebSockets.',
  },
];

const securityControls = [
  ['bi-key', 'AES-256-GCM encryption of personal and card data at rest'],
  ['bi-patch-check', 'RS256-signed access tokens with rotating refresh tokens'],
  ['bi-phone', 'Two-factor login with any authenticator app (TOTP)'],
  ['bi-hdd-network', 'TLS-secured sockets for card transactions'],
  ['bi-shield-check', 'Rate limiting, account lockout and input sanitisation'],
  ['bi-fingerprint', 'Fraud risk scoring on every transfer'],
];

const techStack = [
  'MongoDB',
  'NestJS',
  'React 19',
  'TypeScript',
  'Redux Toolkit',
  'Bootstrap 5',
  'Socket.IO',
  'Spring Boot',
  'ISO 8583',
  'SOAP / WSDL',
  'nginx',
  'Jest',
];

export default function LandingPage() {
  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar expand="md" className="border-bottom bg-body sticky-top" collapseOnSelect>
        <Container>
          <Logo />
          <Navbar.Toggle aria-controls="landing-nav" />
          <Navbar.Collapse id="landing-nav">
            <Nav className="me-auto ms-md-4">
              <Nav.Link href="#features">Features</Nav.Link>
              <Nav.Link href="#security">Security</Nav.Link>
              <Nav.Link href="#technology">Technology</Nav.Link>
            </Nav>
            <div className="d-flex align-items-center gap-2 py-2 py-md-0">
              <ThemeToggle />
              <Link to="/login" className="btn btn-outline-primary">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Open an account
              </Link>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <main className="flex-grow-1">
        <section className="landing-hero">
          <Container>
            <Row className="align-items-center g-5">
              <Col lg={6}>
                <span className="hero-badge mb-3">
                  <i className="bi bi-stars" aria-hidden="true" /> Digital banking, secure by design
                </span>
                <h1 className="hero-title mb-3">
                  Banking that moves <span className="text-gradient">as fast as you do</span>
                </h1>
                <p className="lead text-body-secondary mb-4">
                  Open an account, send money anywhere in India, manage virtual cards and track
                  every rupee, protected by bank-grade encryption and fraud monitoring.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <Link to="/register" className="btn btn-primary btn-lg">
                    Get started <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
                  </Link>
                  <Link to="/login" className="btn btn-outline-secondary btn-lg">
                    I already bank here
                  </Link>
                </div>
                <div className="d-flex flex-wrap gap-4 mt-4 small text-body-secondary">
                  <span>
                    <i className="bi bi-check-circle-fill text-success me-1" aria-hidden="true" />
                    Zero-balance savings
                  </span>
                  <span>
                    <i className="bi bi-check-circle-fill text-success me-1" aria-hidden="true" />
                    24x7 IMPS and NEFT
                  </span>
                  <span>
                    <i className="bi bi-check-circle-fill text-success me-1" aria-hidden="true" />
                    Instant virtual card
                  </span>
                </div>
              </Col>
              <Col lg={6}>
                <HeroPreview />
              </Col>
            </Row>
          </Container>
        </section>

        <section id="features" className="py-5">
          <Container>
            <div className="text-center mb-5">
              <div className="section-eyebrow mb-2">Features</div>
              <h2 className="h1 fw-bold">Everything a modern bank needs</h2>
              <p className="text-body-secondary mx-auto" style={{ maxWidth: 620 }}>
                Customer internet banking, a branch and admin portal, and a card payment switch,
                working together on one platform.
              </p>
            </div>
            <Row xs={1} md={2} lg={3} className="g-4">
              {features.map((feature) => (
                <Col key={feature.title}>
                  <div className="card feature-card card-hover p-4">
                    <div className={`icon-tile icon-tile-${feature.tone} mb-3`}>
                      <i className={`bi ${feature.icon}`} aria-hidden="true" />
                    </div>
                    <h3 className="h5">{feature.title}</h3>
                    <p className="text-body-secondary mb-0">{feature.text}</p>
                  </div>
                </Col>
              ))}
            </Row>
          </Container>
        </section>

        <section id="security" className="py-5 bg-body-tertiary">
          <Container>
            <Row className="align-items-center g-5">
              <Col lg={5}>
                <div className="section-eyebrow mb-2">Security</div>
                <h2 className="h1 fw-bold mb-3">Your money, protected in layers</h2>
                <p className="text-body-secondary">
                  ArthaBank applies defence in depth: encryption at rest and in transit, strong
                  authentication, least-privilege access and an audit trail that cannot be quietly
                  rewritten.
                </p>
              </Col>
              <Col lg={7}>
                <Row xs={1} sm={2} className="g-3">
                  {securityControls.map(([icon, text]) => (
                    <Col key={text}>
                      <div className="card h-100 p-3 d-flex flex-row gap-3 align-items-start">
                        <div className="icon-tile icon-tile-primary">
                          <i className={`bi ${icon}`} aria-hidden="true" />
                        </div>
                        <p className="mb-0 small fw-medium">{text}</p>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Col>
            </Row>
          </Container>
        </section>

        <section id="technology" className="py-5">
          <Container className="text-center">
            <div className="section-eyebrow mb-2">Technology</div>
            <h2 className="h2 fw-bold mb-4">Built on a modern, proven stack</h2>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              {techStack.map((tech) => (
                <span key={tech} className="tech-pill">
                  {tech}
                </span>
              ))}
            </div>
            <a href={env.apiDocsUrl} className="btn btn-link mt-3" target="_blank" rel="noreferrer">
              Explore the REST API documentation{' '}
              <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
            </a>
          </Container>
        </section>
      </main>

      <footer className="border-top py-4">
        <Container className="d-flex flex-column flex-md-row gap-3 justify-content-between align-items-center">
          <div className="small text-body-secondary text-center text-md-start">
            © {new Date().getFullYear()} ArthaBank. A demonstration project, not a real bank.
          </div>
          <ApiStatus />
        </Container>
      </footer>
    </div>
  );
}

/** A static product preview built from the same components as the app. */
function HeroPreview() {
  const transactions = [
    { name: 'Salary - Infosys Ltd', amount: '+ ₹85,000.00', credit: true, icon: 'bi-briefcase' },
    { name: 'IMPS to Rahul Verma', amount: '- ₹2,500.00', credit: false, icon: 'bi-send' },
    { name: 'Swiggy (POS)', amount: '- ₹486.00', credit: false, icon: 'bi-bag' },
  ];
  return (
    <div className="position-relative mx-auto" style={{ maxWidth: 460 }}>
      <div className="bank-card mb-n5 ms-auto me-4 position-relative" style={{ zIndex: 2 }}>
        <div className="d-flex justify-content-between align-items-start">
          <div className="chip" aria-hidden="true" />
          <span className="fw-semibold small letter-spacing-wide">DEBIT</span>
        </div>
        <div className="card-number">6081 •••• •••• 4821</div>
        <div className="d-flex justify-content-between align-items-end small">
          <div>
            <div className="opacity-75" style={{ fontSize: '0.65rem' }}>
              CARD HOLDER
            </div>
            <div className="fw-semibold">PRIYA SHARMA</div>
          </div>
          <div className="fw-bold fst-italic">RuPay</div>
        </div>
      </div>
      <div className="card p-4 pt-5 position-relative" style={{ zIndex: 1 }}>
        <div className="d-flex justify-content-between align-items-center mt-4 mb-3">
          <div>
            <div className="card-title-sm">Available balance</div>
            <div className="h3 mb-0 fw-bold">₹2,48,615.40</div>
          </div>
          <Badge bg="success-subtle" text="success" className="rounded-pill">
            <i className="bi bi-graph-up-arrow me-1" aria-hidden="true" />
            +12.4%
          </Badge>
        </div>
        <ul className="list-unstyled mb-0 d-grid gap-3">
          {transactions.map((txn) => (
            <li key={txn.name} className="d-flex align-items-center gap-3">
              <div
                className={`icon-tile ${txn.credit ? 'icon-tile-success' : 'icon-tile-primary'}`}
              >
                <i className={`bi ${txn.icon}`} aria-hidden="true" />
              </div>
              <div className="flex-grow-1 small fw-medium">{txn.name}</div>
              <div className={`small fw-semibold ${txn.credit ? 'amount-credit' : 'amount-debit'}`}>
                {txn.amount}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
