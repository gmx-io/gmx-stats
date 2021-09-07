import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Home from './Home';
import Arbitrum from './Arbitrum';
import Trading from './Trading';
import './App.css';

const App = () => (
  <Switch>
    <div className="App">
      <Route exact path="/" component={Home} />
      <Route exact path="/arbitrum" component={Arbitrum} />
      <Route exact path="/trading" component={Trading} />
    </div>
  </Switch>
);

export default App;
