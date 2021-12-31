import React, { useState, useEffect} from 'react';
import { Route, Switch, NavLink } from 'react-router-dom';
import cx from "classnames";
import Bsc from './Bsc';
import Arbitrum from './Arbitrum';
import Avalanche from './Avalanche';
import Trading from './Trading';
import './App.css';
import darkLogoIcon from './img/logo_GMX_dark.svg';
import lightLogoIcon from './img/logo_GMX_light.svg';
import { FaSun, FaMoon } from "react-icons/fa";

const App = () => {
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const savedMode = window.localStorage.getItem('mode');
    setMode(savedMode);
  }, [])

  const switchMode = () => {
    const targetMode = mode == 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('mode', targetMode);
    setMode(targetMode)
  }

  return (
    <Switch>
      <div className={cx("App", mode)}>
        <div className="nav">
          <div className="nav-left">
            <a href="https://gmx.io" target="_blank" className="nav-logo">
              <img width="87" src={ mode == 'dark' ? darkLogoIcon : lightLogoIcon } />
            </a>
            <NavLink to="/" exact className="nav-link" activeClassName="active">Arbitrum</NavLink> 
            <NavLink to="/bsc" className="nav-link" activeClassName="active">BSC</NavLink> 
          </div>
          <div className="nav-right">
            <a href="https://gmx.io" target="_blank" className="nav-link">APP</a> 
            <a href="https://gmxio.gitbook.io/gmx/" target="_blank" className="nav-link">DOCS</a>
            <div className='modeselect' onClick={() => switchMode()}>
              { mode == 'dark' ? <FaSun /> : <FaMoon /> }
            </div>
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
  )
};

export default App;
