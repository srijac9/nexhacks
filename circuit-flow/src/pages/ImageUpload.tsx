import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CircuitButton from '@/components/CircuitButton';
import CircuitBackground from '@/components/CircuitBackground';
import { ArrowLeft, Upload, Image as ImageIcon, Check, X, Play } from 'lucide-react';

const ImageUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [showStartButton, setShowStartButton] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setUploadStatus('idle');
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    console.log('handleUpload called, selectedFile:', selectedFile?.name || 'none');
    setUploading(true);
    setUploadStatus('idle');
    setStatusMessage('Uploading...');

    try {
      // Upload file if one is selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append('photo', selectedFile, selectedFile.name);

        const response = await fetch("http://localhost:3000/upload", { 
          method: "POST", 
          body: formData 
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }
      }

      // Always call process-schematic after upload (or even if no file selected)
      // It will process whatever schematic is in files/schematic-diagrams
      setStatusMessage('Processing schematic...');
      console.log('Calling process-schematic endpoint...');
      
      const processResponse = await fetch("http://localhost:8001/process-schematic?save=true", {
        method: 'GET'
      });

      console.log('Process schematic response status:', processResponse.status);

      if (processResponse.ok) {
        const processData = await processResponse.json();
        console.log('Process schematic success:', processData);
        setUploadStatus('success');
        const uploadMsg = selectedFile ? `Successfully uploaded: ${selectedFile.name}` : '';
        setStatusMessage(`${uploadMsg ? uploadMsg + '. ' : ''}Schematic processed successfully`);
      } else {
        const errorData = await processResponse.json().catch(() => ({ detail: `HTTP ${processResponse.status}: ${processResponse.statusText}` }));
        console.error('Process schematic error:', errorData);
        throw new Error(errorData.detail || `Failed to process schematic: ${processResponse.status}`);
      }
    } catch (error: any) {
      // Silently handle errors - only log to console
      console.error('Upload/processing error:', error);
      // Don't set error status or message to avoid UI popups
    } finally {
      setUploading(false);
      // Show Start button after upload attempt (regardless of success/failure)
      setShowStartButton(true);
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setPreview(null);
    setUploadStatus('idle');
    setStatusMessage('');
    setShowStartButton(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative min-h-screen">
      <CircuitBackground />
      
      <div className="relative z-10 container mx-auto px-4 py-12">
        <header className="flex items-center justify-between mb-8">
          <CircuitButton 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </CircuitButton>
        </header>

        <div className="max-w-3xl mx-auto">
          {/* Hero section */}
          <section className="text-center mb-12">
            <div className="inline-block px-4 py-2 border border-primary/30 text-primary text-sm font-mono mb-6">
              <Upload className="w-4 h-4 inline-block mr-2" />
              Image Upload
            </div>
            
            <h1 className="font-display text-4xl md:text-6xl font-bold mb-6 circuit-text">
              UPLOAD<span className="text-secondary">_</span>IMAGE
            </h1>
            
            <p className="font-mono text-muted-foreground max-w-2xl mx-auto">
              Upload circuit images for processing and analysis
            </p>
          </section>

          {/* Upload area */}
          <div className="bg-card/50 backdrop-blur-sm border border-border rounded-lg p-8 mb-8">
            {!preview ? (
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-mono text-lg text-foreground mb-2">
                    Click to select an image
                  </p>
                  <p className="font-mono text-sm text-muted-foreground">
                    or drag and drop here
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                <div className="text-center">
                  <p className="font-mono text-sm text-muted-foreground mb-2">
                    or process existing schematic
                  </p>
                  <CircuitButton
                    onClick={handleUpload}
                    disabled={uploading}
                    size="lg"
                  >
                    {uploading ? 'Processing...' : 'Process Schematic'}
                  </CircuitButton>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full max-h-96 object-contain rounded-lg border border-border bg-card/30"
                  />
                  <CircuitButton
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={handleRemove}
                  >
                    <X className="w-4 h-4" />
                  </CircuitButton>
                </div>
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm text-muted-foreground">
                    {selectedFile?.name} ({(selectedFile?.size || 0) / 1024} KB)
                  </p>
                  <CircuitButton
                    onClick={handleUpload}
                    disabled={uploading}
                    size="lg"
                  >
                    {uploading ? 'Processing...' : 'Upload & Process'}
                  </CircuitButton>
                </div>
              </div>
            )}
          </div>

          {/* Status message - only show success, hide errors */}
          {statusMessage && uploadStatus === 'success' && (
            <div
              className="p-4 rounded-lg border font-mono text-sm mb-4 bg-circuit-green/10 border-circuit-green/30 text-circuit-green"
            >
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{statusMessage}</span>
              </div>
            </div>
          )}

          {/* Start button - appears after upload button is pressed */}
          {showStartButton && (
            <div className="text-center mb-8">
              <CircuitButton
                onClick={() => navigate('/schematic')}
                size="lg"
                className="min-w-[200px]"
              >
                <Play className="w-5 h-5 mr-2" />
                Start
              </CircuitButton>
            </div>
          )}

          {/* Info section */}
          <section className="mt-12 p-6 bg-card/30 border border-border rounded-lg">
            <p className="font-mono text-xs text-muted-foreground text-center">
              <span className="text-primary">&gt;</span> Supported formats: JPEG, PNG, GIF, WebP
              <span className="text-secondary mx-2">|</span>
              Max file size: 10MB
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;
