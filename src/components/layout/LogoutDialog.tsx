import { figmaAssets } from '@/assets/figma';
import { useAuth } from '@/auth/AuthProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export const LogoutDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { logout, isLoggingOut } = useAuth();
  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      icon={<img src={figmaAssets.iconLogout} alt="" width={40} height={40} />}
      title="Confirm Log Out"
      description="Are you sure you want to log out of your account?"
      confirmLabel="Log Out"
      loading={isLoggingOut}
      onCancel={onClose}
      onConfirm={() => void logout()}
    />
  );
};
