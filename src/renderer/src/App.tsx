import { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import { DashboardOutlined, BarChartOutlined, ExperimentOutlined } from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import Backtest from './pages/Backtest';
import StrategyLab from './pages/StrategyLab';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const App = () => {
  const [selectedKey, setSelectedKey] = useState('dashboard');

  const menuItems = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: '驾驶舱' },
    { key: 'backtest', icon: <BarChartOutlined />, label: '回测中心' },
    { key: 'strategy', icon: <ExperimentOutlined />, label: '策略研究' },
  ];

  const renderContent = () => {
    switch (selectedKey) {
      case 'dashboard':
        return <Dashboard />;
      case 'backtest':
        return <Backtest />;
      case 'strategy':
        return <StrategyLab />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider theme="dark" width={200}>
        <div style={{ padding: '16px', color: '#fff', textAlign: 'center' }}>
          <Title level={4} style={{ margin: 0, color: '#fff' }}>QuantTerminal</Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => setSelectedKey(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            {menuItems.find(item => item.key === selectedKey)?.label}
          </Title>
        </Header>
        <Content style={{ background: '#f5f5f5' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;