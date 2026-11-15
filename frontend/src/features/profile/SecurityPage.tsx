import { Col, Row } from 'react-bootstrap';
import { PageHeader } from '@/components/common/PageHeader';
import { PageLoader } from '@/components/common/PageLoader';
import { useMeQuery } from '@/features/auth/authApi';
import { ChangePasswordCard } from './ChangePasswordCard';
import { MfaCard } from './MfaCard';
import { ProfileCard } from './ProfileCard';
import { SessionsCard } from './SessionsCard';

export default function SecurityPage() {
  const { data: user, isLoading } = useMeQuery();
  if (isLoading || !user) return <PageLoader label="Loading your profile" />;

  return (
    <>
      <PageHeader
        title="Profile and security"
        subtitle="Your personal details, sign-in methods and devices."
      />
      <Row className="g-4">
        <Col lg={5}>
          <ProfileCard user={user} />
        </Col>
        <Col lg={7} className="d-grid gap-4 align-content-start">
          <MfaCard enabled={user.mfaEnabled} />
          <SessionsCard />
          <ChangePasswordCard />
        </Col>
      </Row>
    </>
  );
}
