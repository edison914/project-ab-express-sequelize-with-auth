import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import Navigation from './components/Navigation/Navigation';
import * as sessionActions from './store/session';


function Layout() {
  const dispatch = useDispatch();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    dispatch(sessionActions.restoreUser()).then(() => {
      //console.log(`is this called 1`)
      setIsLoaded(true)
    });
  }, [dispatch]);

  return (
    <>
      {/* always redender the nvaigationBar and pass the isload state to the navigation component */}
      <Navigation isLoaded={isLoaded} />
      {/* if isLoaded is true then render all the children router that matches */}
      {isLoaded && <Outlet />}
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: '/',
        element: <h1>Welcome!</h1>
      },
    ]
  }
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;