/** 主布局：侧边栏 + 顶栏 + 内容区 */
import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Typography, Tag, Space } from 'antd';
import { UserOutlined, LogoutOutlined, KeyOutlined } from '@ant-design/icons';
import { MENU_ITEMS } from '../config/menu';
import { useAuth } from '../services/authStore';

const { Sider, Header, Content } = Layout;
const { Title } = Typography;

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const items = useMemo(() => {
    return MENU_ITEMS.filter((m) => !m.adminOnly || user?.role === 'admin');
  }, [user?.role]);

  const selectedKey = useMemo(() => {
    const hit = MENU_ITEMS.find((m) => location.pathname.startsWith(m.path));
    return hit?.key ?? 'dashboard';
  }, [location.pathname]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const userMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: `${user?.realname || '未登录'} (${user?.role})`,
        disabled: true,
      },
      { type: 'divider' as const },
      {
        key: 'change-password',
        icon: <KeyOutlined />,
        label: '修改密码',
        onClick: () => navigate('/settings'),
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        onClick: onLogout,
      },
    ],
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider theme="dark" width={210} collapsible>
        <div
          style={{
            padding: '14px 16px',
            color: '#fff',
            textAlign: 'center',
            borderBottom: '1px solid #1f1f1f',
          }}
        >
          <Title level={4} style={{ margin: 0, color: '#fff' }}>
            QuantTerminal
          </Title>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>v0.3.0</div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items.map((m) => ({
            key: m.key,
            icon: m.icon,
            label: m.label,
            onClick: () => navigate(m.path),
          }))}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            {MENU_ITEMS.find((m) => m.key === selectedKey)?.label ?? '总览'}
          </Title>
          <Space size="middle">
            <Tag color="blue">{user?.role?.toUpperCase()}</Tag>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ background: '#f5f5f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
