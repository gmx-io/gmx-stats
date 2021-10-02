import React from 'react';
import { Route, Switch, Link } from 'react-router-dom';
import Bsc from './Bsc';
import Arbitrum from './Arbitrum';
import Trading from './Trading';
import BscOrders from './BscOrders';
import './App.css';

const App = () => (
  <Switch>
    <div className="App">
      <div className="nav">
        <div className="nav-left">
          <a href="https://gmx.io" target="_blank" className="nav-logo">
            <img width="24" src="/favicon.png" />
          </a>
          <Link to="/" className="nav-link">ARBITRUM</Link> 
          <Link to="/bsc" className="nav-link">BSC</Link> 
        </div>
        <div className="nav-right">
          <a href="https://gmx.io" target="_blank" className="nav-link">APP</a> 
          <a href="https://gmxio.gitbook.io/gmx/" target="_blank" className="nav-link">DOCS</a> 
        </div>
      </div>
      <div className="content">
        <Route exact path="/" component={Arbitrum} />
        <Route exact path="/bsc" component={Bsc} />
        <Route exact path="/trading" component={Trading} />
        <Route exact path="/bsc-orders" component={BscOrders} />
      </div>
    </div>
  </Switch>
);

export default App;
