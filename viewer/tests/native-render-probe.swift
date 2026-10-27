import AppKit
import WebKit

@MainActor final class RenderProbe: NSObject, NSApplicationDelegate, WKURLSchemeHandler, WKScriptMessageHandler {
    var view: WKWebView!
    // A generated fixture folder containing viewer/ and full-preview/.
    let root = URL(filePath: CommandLine.arguments[1])
    let recipe = ProcessInfo.processInfo.environment["SEKAI_RENDER_RECIPE"] ?? "recipe.json"
    var recipes: [String] { ProcessInfo.processInfo.environment["SEKAI_RENDER_RECIPES"]?.split(separator: ",").map(String.init) ?? [recipe] }
    var recipeIndex = 0
    var previousMotionTime = 0.0
    var requests = 0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(self, forURLScheme: "sekai3d")
        config.userContentController.add(self, name: "model3D")
        if ProcessInfo.processInfo.environment["SEKAI_RENDER_VALIDATE_MOTION"] == "1" {
            // Drive this offscreen renderer with a deterministic clock. WebKit
            // otherwise suspends requestAnimationFrame for a view without a window.
            config.userContentController.addUserScript(WKUserScript(source: "let callbacks=new Map(),frameID=0,testTime=0;window.requestAnimationFrame=cb=>{callbacks.set(++frameID,cb);return frameID};window.cancelAnimationFrame=id=>callbacks.delete(id);window.__advanceTestFrames=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++){testTime+=1000/60;const next=[...callbacks.values()];callbacks.clear();for(const callback of next)callback(testTime)}};", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController.addUserScript(WKUserScript(source: "window.addEventListener('error',event=>window.webkit.messageHandlers.model3D.postMessage({type:'error',message:String(event.error??event.message)}));window.addEventListener('unhandledrejection',event=>window.webkit.messageHandlers.model3D.postMessage({type:'error',message:String(event.reason)}));window.__renderErrors=[]; const oldError=console.error; console.error=(...args)=>{window.__renderErrors.push(args.map(String).join(' '));oldError(...args)};", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0,y: 0,width: 700,height: 800), configuration: config)
        view.load(URLRequest(url: URL(string: "sekai3d://viewer/index.html")!))
        DispatchQueue.main.asyncAfter(deadline: .now()+120) { self.view.evaluateJavaScript("JSON.stringify({errors:window.__renderErrors,html:document.readyState})"){v,e in print("NATIVE RENDER TIMEOUT",self.requests,v as Any,e as Any);exit(2)} }
    }
    func webView(_ view: WKWebView, start task: any WKURLSchemeTask) {
        do {
            guard let url = task.request.url else { throw URLError(.badURL) }
            let path = String(url.path.dropFirst())
            guard !path.contains(".."), !path.contains("\\") else { throw URLError(.badURL) }
            let file = root.appendingPathComponent(url.host == "viewer" ? "viewer" : "full-preview").appendingPathComponent(path)
            let data = try Data(contentsOf: file)
            requests += 1
            let mime = ["js":"text/javascript","html":"text/html","json":"application/json","png":"image/png"][url.pathExtension] ?? "application/octet-stream"
            task.didReceive(HTTPURLResponse(url: url,statusCode: 200,httpVersion: nil,headerFields: ["Content-Type":mime,"Access-Control-Allow-Origin":"*"])!)
            task.didReceive(data);task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ view: WKWebView, stop task: any WKURLSchemeTask) {}
    func loadRecipe() {
        do {
            let data = try Data(contentsOf: root.appendingPathComponent("full-preview/" + recipes[recipeIndex]))
            view.evaluateJavaScript("window.loadModel(\(String(decoding:data,as:UTF8.self)));null")
        } catch { print("PROBE INPUT",error);exit(1) }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "ready" {
            loadRecipe()
        } else if type == "error" { print("NATIVE RENDER ERROR",body["message"] ?? "");exit(1) }
        else if type == "loaded" {
            DispatchQueue.main.asyncAfter(deadline: .now()+2) {
                var advance = ""
                if ProcessInfo.processInfo.environment["SEKAI_RENDER_VALIDATE_MOTION"] == "1" {
                    if self.recipeIndex == 0 {
                        advance = "const start=window.getLocalModelDiagnostics().motion;if(start?.phase!=='intro'||start.clipName!=='motion')throw Error('Entrance was skipped');window.__advanceTestFrames(.5);if(window.getLocalModelDiagnostics().motion.time<.4)throw Error('Entrance did not advance');window.__advanceTestFrames(start.introDuration+.25);if(window.getLocalModelDiagnostics().motion.phase!=='loop')throw Error('Entrance did not transition to idle');"
                    } else {
                        advance = "const start=window.getLocalModelDiagnostics().motion;if(start?.phase!=='loop'||Math.abs(start.time-\(self.previousMotionTime))>0.00001)throw Error('Part switch lost motion progress');window.__advanceTestFrames(.5);"
                    }
                }
                self.view.evaluateJavaScript("(()=>{\(advance)return JSON.stringify({diagnostics:window.getLocalModelDiagnostics(),errors:window.__renderErrors})})()") { value,error in
                guard error == nil, let string = value as? String else { print("DIAGNOSTICS",error as Any);exit(1) }
                do {
                    try string.write(to: self.root.appendingPathComponent("render-diagnostics.json"), atomically:true, encoding:.utf8)
                    let json = try JSONSerialization.jsonObject(with: Data(string.utf8)) as! [String:Any]
                    let errors = json["errors"] as? [String] ?? []
                    let diagnostics = json["diagnostics"] as? [String:Any] ?? [:]
                    let model = diagnostics["model"] as? [String:Any] ?? [:]
                    guard model["source"] as? String == "local-unity", (model["meshCount"] as? Int ?? 0) > 0, (model["motionTracks"] as? Int ?? 0) > 0 else { print("MISSING LOCAL CHARACTER",model);exit(1) }
                    guard errors.isEmpty else { print("GPU ERRORS",errors);exit(1) }
                    self.previousMotionTime = (diagnostics["motion"] as? [String:Any])?["time"] as? Double ?? 0
                    print("RECIPE RENDER PASSED",self.recipes[self.recipeIndex])
                    if self.recipeIndex + 1 < self.recipes.count {
                        self.recipeIndex += 1
                        self.loadRecipe()
                        return
                    }
                    print("NATIVE WEBKIT RENDER PASSED",self.requests,"local resources")
                    self.view.takeSnapshot(with:nil) { image,error in
                        if ProcessInfo.processInfo.environment["SEKAI_RENDER_SNAPSHOT"] == "1", let image, let tiff=image.tiffRepresentation, let png=NSBitmapImageRep(data:tiff)?.representation(using:.png,properties:[:]) { try? png.write(to:self.root.appendingPathComponent("render.png")) }
                        self.view.evaluateJavaScript("window.disposeModelViewer();null") { _,_ in exit(0) }
                    }
                } catch { print(error);exit(1) }
            } }
        }
    }
}
MainActor.assumeIsolated {
guard CommandLine.arguments.count == 2 else { print("Usage: native-render-probe /absolute/path/to/fixtures");exit(1) }
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let probe = RenderProbe()
app.delegate = probe
withExtendedLifetime(probe) { app.run() }
}
