import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import UploadPage from './components/UploadPage';
import DownloadPage from './components/DownloadPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { CSRFProvider } from './contexts/CSRFContext';
import CSRFProtectedView from './components/CSRFProtectedView';
import ThemeToggle from './components/ThemeToggle';

function App() {
  return (
    <ThemeProvider>
      <CSRFProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            <ThemeToggle />
            <header className="fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 shadow-md backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95 transition-colors duration-200">
              <div className="mx-auto px-4 py-4 sm:px-6 lg:px-8">
                <Link to="/" className="inline-block">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">
                    fileLair
                  </h1>
                </Link>
              </div>
            </header>
            <main className="pt-16">
              <CSRFProtectedView>
                <Routes>
                  <Route path="/" element={<UploadPage />} />
                  <Route path="/download/:shareId" element={<DownloadPage />} />
                </Routes>
              </CSRFProtectedView>
            </main>
          </div>
        </Router>
      </CSRFProvider>
    </ThemeProvider>
  );
}

export default App;
