import { Route, Routes } from 'react-router-dom';

export function AppRoutes() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <Routes>
        <Route
          path="/"
          element={
            <>
              <h1>Denver Axel Marbida</h1>
              <p>Agentic Full-Stack Software Developer</p>
              <a href="https://github.com/DenverAxelMarbida">View GitHub</a>
            </>
          }
        />
        <Route
          path="*"
          element={
            <>
              <h1>Page not found</h1>
              <p>That page is unavailable.</p>
              <a href="/">Back to home</a>
            </>
          }
        />
      </Routes>
    </main>
  );
}
